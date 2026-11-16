import { buildSearchUrl, parseSuggestions, type AddressSuggestion } from "@/lib/address-search";
import { resolveHusnummer } from "@/lib/house-search-geocode";

export interface LatLon {
  lat: number;
  lon: number;
}

/** `null` means "looked up, and the register has no such address": worth remembering. */
export type GeoCache = Record<string, [number, number] | null>;

const STORAGE_KEY = "boligdata.sold-geocode.v1";

export function readCache(): GeoCache {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as GeoCache) : {};
  } catch {
    return {};
  }
}

export function writeCache(cache: GeoCache): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Private mode or a full quota: the map still works, it just looks the addresses up again next time.
  }
}

const squash = (text: string) => text.toLowerCase().replace(/[\s,]+/g, "");

/**
 * Chooses the suggestion that is this address in this postcode. "Vester Vænge Alle 3" must not be
 * answered with "Vester Vænge Alle 30", and the same street name exists in other towns.
 */
export function pickSuggestion(address: string, postalCode: string, suggestions: readonly AddressSuggestion[]): AddressSuggestion | null {
  const wanted = squash(address);
  // Compare the street-and-number part exactly: a prefix match would accept number 30 for number 3.
  const exact = suggestions.filter((s) => s.kind === "address" && s.id !== null && squash(s.label.split(",")[0] ?? "") === wanted);
  const inPostcode = exact.filter((s) => s.label.includes(postalCode));
  return inPostcode[0] ?? null;
}

export type GeocodeOutcome = { status: "found"; point: LatLon } | { status: "missing" } | { status: "error" };

/** Never throws. `error` is transient (network, rate limit) and is not cached; `missing` is. */
export async function geocodeAddress(address: string, postalCode = "9000", signal?: AbortSignal): Promise<GeocodeOutcome> {
  try {
    const res = await fetch(buildSearchUrl(`${address}, ${postalCode}`), { signal });
    if (!res.ok) return { status: "error" };
    const suggestion = pickSuggestion(address, postalCode, parseSuggestions(await res.json()));
    if (!suggestion?.id) return { status: "missing" };
    const resolved = await resolveHusnummer(suggestion.id, signal);
    if (resolved.lat === null || resolved.lon === null) return { status: "error" };
    return { status: "found", point: { lat: resolved.lat, lon: resolved.lon } };
  } catch {
    return { status: "error" };
  }
}

/**
 * Looks addresses up a few at a time, skipping any already in the cache, and reports each result as
 * it arrives so the map fills in progressively.
 */
export async function geocodeAll(
  addresses: readonly string[],
  options: {
    cache: GeoCache;
    signal: AbortSignal;
    onResult: (address: string, point: LatLon | null) => void;
    onProgress: (done: number, total: number) => void;
    concurrency?: number;
    lookup?: (address: string, signal: AbortSignal) => Promise<GeocodeOutcome>;
  },
): Promise<{ failed: number }> {
  const { cache, signal, onResult, onProgress, concurrency = 4 } = options;
  const lookup = options.lookup ?? ((a, s) => geocodeAddress(a, "9000", s));
  const queue = [...new Set(addresses)];
  const total = queue.length;
  let done = 0;
  let failed = 0;
  onProgress(0, total);

  const worker = async () => {
    for (let address = queue.shift(); address !== undefined; address = queue.shift()) {
      if (signal.aborted) return;
      const cached = cache[address];
      if (cached !== undefined) {
        onResult(address, cached === null ? null : { lat: cached[0], lon: cached[1] });
      } else {
        const outcome = await lookup(address, signal);
        if (signal.aborted) return;
        if (outcome.status === "found") {
          cache[address] = [outcome.point.lat, outcome.point.lon];
          onResult(address, outcome.point);
        } else if (outcome.status === "missing") {
          cache[address] = null;
          onResult(address, null);
        } else {
          failed += 1;
          onResult(address, null);
        }
      }
      done += 1;
      onProgress(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { failed };
}

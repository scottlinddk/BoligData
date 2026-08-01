import type { SoldPriceEntry } from "../../../../../packages/shared/src/types/index.js";
import { fetchJson } from "../crawl/http.js";
import { mapRegistrations } from "../crawl/boligsiden.js";
import { asFiniteNumber, asNonEmptyString, asPositiveInt, isDanishCoordinate } from "../crawl/map-utils.js";
import { haversineMeters } from "../row-mappers.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "BOLIGSIDEN_SALES_MOCK_MODE";

/**
 * Boligsiden's address search — the same undocumented JSON API its own
 * frontend calls, and the source behind the site's "salg i nærheden" and
 * "boligens historie" panels. Unauthenticated and undocumented, so every
 * field goes through defensive mapping and the base is env-overridable.
 *
 * Parameters below were established against the live API (2026-08-01) rather
 * than guessed. The gateway validates enums and reports the allowed set in its
 * 400 body, which is how `sortBy` and `registrationTypes` were pinned down:
 *
 *   sortBy            address | livingArea | lotArea | monthlyExpense |
 *                     numRooms | perAreaPrice | price | priceChange | road |
 *                     soldDate | soldPrice | timeOnMarket | zipCode | distance
 *   registrationTypes normal | family | auction | other
 *
 * Unknown parameter *names* are silently ignored (a `bbox=` filter came back
 * unfiltered rather than erroring), which is why the geographic filter here is
 * `polygon=` — verified to actually constrain results — and not a plausible
 * spelling that would quietly return the whole country.
 */
const DEFAULT_API_BASE = "https://api.boligsiden.dk/search/addresses";

/** Half-width of the search box. ~500 m is a street-and-neighbours radius, not a district. */
const DEFAULT_RADIUS_M = 500;
const DEFAULT_LIMIT = 8;
/** Same-address tolerance when picking the subject property out of the results. */
const SUBJECT_MATCH_METERS = 20;

export interface NearbySale {
  address: string;
  soldDate: string;
  price: number;
  pricePerSqm: number;
  saleType: NonNullable<SoldPriceEntry["saleType"]>;
  areaSqm: number | null;
  propertyType: string | null;
  distanceMeters: number;
  lat: number;
  lon: number;
}

export interface BoligsidenSales {
  /** Registered sales of the subject address itself, newest first. Empty when the point matched no address. */
  priceHistory: SoldPriceEntry[];
  /** Most recent registered sales of *other* addresses in the box, nearest first. */
  nearbySales: NearbySale[];
}

function apiBase(): string {
  return process.env.BOLIGSIDEN_ADDRESS_API_BASE?.trim() || DEFAULT_API_BASE;
}

/**
 * Axis-aligned box around a point, in the `lon,lat|lon,lat|...` order the API
 * expects — the opposite of how this repo names coordinates everywhere else,
 * and the easiest thing to get silently backwards (a swapped pair lands in the
 * North Sea and returns an empty, entirely plausible-looking result).
 */
export function boxPolygon(lat: number, lon: number, radiusMeters: number): string {
  const dLat = radiusMeters / 111_320;
  const dLon = radiusMeters / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const round = (n: number) => n.toFixed(6);
  const [south, north, west, east] = [lat - dLat, lat + dLat, lon - dLon, lon + dLon];
  return [
    `${round(west)},${round(south)}`,
    `${round(east)},${round(south)}`,
    `${round(east)},${round(north)}`,
    `${round(west)},${round(north)}`,
  ].join("|");
}

function formatAddress(record: Record<string, unknown>): string | null {
  const road = asNonEmptyString((record.road as Record<string, unknown> | undefined)?.name) ?? asNonEmptyString(record.roadName);
  if (road === null) return null;
  const houseNumber = asNonEmptyString(record.houseNumber);
  const zip = asPositiveInt(record.zipCode);
  const city = asNonEmptyString(record.cityName);
  const street = `${road}${houseNumber !== null ? ` ${houseNumber}` : ""}`;
  const tail = [zip !== null ? String(zip) : null, city].filter((p) => p !== null).join(" ");
  return tail === "" ? street : `${street}, ${tail}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface AddressSearchResponse {
  addresses?: unknown;
}

interface ParsedAddress {
  record: Record<string, unknown>;
  lat: number;
  lon: number;
  history: SoldPriceEntry[];
}

function parseAddresses(body: AddressSearchResponse): ParsedAddress[] {
  const addresses = Array.isArray(body.addresses) ? body.addresses : [];
  return addresses
    .map((raw): ParsedAddress | null => {
      const record = asRecord(raw);
      if (record === null) return null;
      const coordinates = asRecord(record.coordinates);
      const lat = asFiniteNumber(coordinates?.lat);
      const lon = asFiniteNumber(coordinates?.lon);
      if (lat === null || lon === null || !isDanishCoordinate(lat, lon)) return null;
      return { record, lat, lon, history: mapRegistrations(record.registrations) };
    })
    .filter((entry): entry is ParsedAddress => entry !== null);
}

function mockSales(lat: number, lon: number): BoligsidenSales {
  const seed = hashSeed(`${lat.toFixed(4)},${lon.toFixed(4)}`);
  const basePrice = 1_800_000 + (seed % 2_000_000);
  const priceHistory: SoldPriceEntry[] = [
    { soldDate: "2021-06-14", price: basePrice, pricePerSqm: Math.round(basePrice / 140), saleType: "normal" },
    {
      soldDate: "2011-03-02",
      price: Math.round(basePrice * 0.7),
      pricePerSqm: Math.round((basePrice * 0.7) / 140),
      saleType: "normal",
    },
  ];
  const nearbySales: NearbySale[] = Array.from({ length: 3 }, (_, i) => ({
    address: `Mockvej ${i + 1}`,
    soldDate: `202${4 - i}-0${i + 3}-11`,
    price: basePrice + i * 150_000,
    pricePerSqm: Math.round((basePrice + i * 150_000) / 140),
    saleType: "normal" as const,
    areaSqm: 140,
    propertyType: "villa",
    distanceMeters: 120 + i * 90,
    lat: lat + i * 0.001,
    lon: lon + i * 0.001,
  }));
  return { priceHistory, nearbySales };
}

export interface NearbySalesOptions {
  radiusMeters?: number;
  limit?: number;
}

/**
 * One request, two answers: the subject address's own sale history and the
 * recent sales around it.
 *
 * Both come out of the same polygon search because the subject property is
 * simply the result standing on the same spot — matching it by coordinate
 * (within `SUBJECT_MATCH_METERS`) is cheaper and more robust than a second
 * lookup keyed on an address string that the register and the listing spell
 * differently. Everything else in the box becomes `nearbySales`, carrying
 * `saleType` through so a family transfer or a forced auction can be shown as
 * what it is rather than averaged into a "neighbourhood price".
 */
export async function lookupBoligsidenSales(
  lat: number,
  lon: number,
  options: NearbySalesOptions = {},
): Promise<SourceResult<BoligsidenSales>> {
  if (!isDanishCoordinate(lat, lon)) return sourceFailed(`no usable coordinates (${lat},${lon})`);
  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockSales(lat, lon));

  const radiusMeters = options.radiusMeters ?? DEFAULT_RADIUS_M;
  const limit = options.limit ?? DEFAULT_LIMIT;

  try {
    const params = new URLSearchParams({
      polygon: boxPolygon(lat, lon, radiusMeters),
      sortBy: "soldDate",
      sortAscending: "false",
      // Oversample: the subject address and any address whose registrations
      // didn't map both come out of this list, so asking for exactly `limit`
      // would routinely return fewer.
      per_page: String(limit + 5),
      page: "1",
    });

    const body = await fetchJson<AddressSearchResponse>(`${apiBase()}?${params}`);
    const parsed = parseAddresses(body);

    const subject = parsed.find((entry) => haversineMeters(lat, lon, entry.lat, entry.lon) <= SUBJECT_MATCH_METERS);

    const nearbySales: NearbySale[] = parsed
      .filter((entry) => entry !== subject)
      .map((entry): NearbySale | null => {
        const latest = entry.history[0];
        const address = formatAddress(entry.record);
        if (!latest || address === null) return null;
        return {
          address,
          soldDate: latest.soldDate,
          price: latest.price,
          pricePerSqm: latest.pricePerSqm,
          saleType: latest.saleType ?? "other",
          areaSqm: asPositiveInt(asRecord(entry.record.boligsidenInfo)?.latestSoldArea),
          propertyType: asNonEmptyString(entry.record.addressType),
          distanceMeters: Math.round(haversineMeters(lat, lon, entry.lat, entry.lon)),
          lat: entry.lat,
          lon: entry.lon,
        };
      })
      .filter((sale): sale is NearbySale => sale !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);

    return sourceOk({ priceHistory: subject?.history ?? [], nearbySales });
  } catch (err) {
    return sourceFailed(err);
  }
}

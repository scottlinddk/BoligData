import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.ADDRESS_LOOKUP_MOCK_MODE !== "false";

/**
 * DAWA is being retired (~2026-08-17) in favor of DAR (Danmarks
 * Adresseregister) served through Datafordeler. Unlike legacy DAWA's single
 * `adgangsadresser` endpoint, which bundled id/matrikelnr/ejerlav/zone into
 * one response, DAR and zone status are separate Datafordeler services —
 * so this now does two independent fetches (`fetchDarAddress`/`fetchZone`)
 * instead of one. Each is caught locally and degrades to nulls on its own;
 * neither can blank out the other's result. Confirm both live response
 * shapes against the real endpoints (not legacy dawa.aws.dk) before flipping
 * ADDRESS_LOOKUP_MOCK_MODE=false.
 */
const DAR_API_BASE = process.env.ADDRESS_LOOKUP_DAR_API_BASE ?? "https://api.dataforsyningen.dk/rest/dar/1.0.0/adresser";
const ZONE_API_BASE = process.env.ADDRESS_LOOKUP_ZONE_API_BASE ?? "https://api.dataforsyningen.dk/rest/zoneinddelinger/1.0.0/zonestatus";

const ZONES = ["byzone", "landzone", "sommerhusomraade"] as const;

export interface AddressCadastral {
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  zone: (typeof ZONES)[number] | null;
}

interface DarAddressResponse {
  id?: unknown;
  matrikelnr?: unknown;
  ejerlav?: { navn?: unknown } | unknown;
}

interface ZoneStatusResponse {
  zone?: unknown;
}

type DarAddressFields = Pick<AddressCadastral, "idLokalid" | "matrikelnr" | "ejerlav">;

function mockCadastral(address: string, postalCode: string | null): AddressCadastral {
  const seed = hashSeed(`${address}|${postalCode ?? ""}`);
  return {
    idLokalid: `mock-${seed.toString(16)}`,
    matrikelnr: `${(seed % 900) + 1}${String.fromCharCode(97 + (seed % 26))}`,
    ejerlav: `Mock Ejerlav ${(seed % 50) + 1}`,
    zone: ZONES[seed % ZONES.length]!,
  };
}

/**
 * Fetches id_lokalid/matrikelnr/ejerlav from DAR. Errors are caught locally
 * and degrade to an all-null result rather than rejecting, so a DAR outage
 * can't wipe out a zone lookup that succeeded independently.
 */
async function fetchDarAddress(address: string, postalCode: string | null): Promise<DarAddressFields> {
  const empty: DarAddressFields = { idLokalid: null, matrikelnr: null, ejerlav: null };
  try {
    const params = new URLSearchParams({
      q: address,
      ...(postalCode ? { postnr: postalCode } : {}),
      struktur: "mini",
    });
    const results = await fetchJson<DarAddressResponse[]>(`${DAR_API_BASE}?${params}`);
    const match = results[0];
    if (!match) return empty;

    const ejerlavRaw = match.ejerlav;
    const ejerlavNavn =
      typeof ejerlavRaw === "object" && ejerlavRaw !== null
        ? asNonEmptyString((ejerlavRaw as Record<string, unknown>).navn)
        : null;

    return {
      idLokalid: asNonEmptyString(match.id),
      matrikelnr: asNonEmptyString(match.matrikelnr),
      ejerlav: ejerlavNavn,
    };
  } catch {
    return empty;
  }
}

/**
 * Fetches zone status (byzone/landzone/sommerhusomraade) by coordinate.
 * Same isolation rule as fetchDarAddress: caught locally, degrades to null.
 */
async function fetchZone(lat: number, lon: number): Promise<AddressCadastral["zone"]> {
  try {
    const params = new URLSearchParams({ x: String(lon), y: String(lat) });
    const result = await fetchJson<ZoneStatusResponse>(`${ZONE_API_BASE}?${params}`);
    return (ZONES as readonly string[]).includes(String(result.zone)) ? (result.zone as AddressCadastral["zone"]) : null;
  } catch {
    return null;
  }
}

/**
 * Looks up the stable address UUID (id_lokalid) plus cadastral parcel
 * (matrikelnr/ejerlav) and zone status for one address. No auth required.
 * DAR and zone status are fetched individually (not combined via
 * Promise.allSettled over a single array) so each one's own try/catch
 * decides its own fallback — one failing never blanks the other's data.
 * Only fails outright (SourceResult.ok = false) when both come back empty.
 */
export async function lookupAddressCadastral(
  address: string,
  postalCode: string | null,
  lat: number,
  lon: number,
): Promise<SourceResult<AddressCadastral>> {
  if (MOCK_MODE) return sourceOk(mockCadastral(address, postalCode));

  // Promise.all, not allSettled: each fetcher already catches its own
  // errors and resolves (never rejects), so there's no per-item .status
  // bookkeeping to get wrong — a failure in one can't suppress the other.
  const [darFields, zone] = await Promise.all([fetchDarAddress(address, postalCode), fetchZone(lat, lon)]);

  if (darFields.idLokalid === null && zone === null) {
    return sourceFailed(`no address or zone match near ${lat},${lon}`);
  }

  return sourceOk({ ...darFields, zone });
}

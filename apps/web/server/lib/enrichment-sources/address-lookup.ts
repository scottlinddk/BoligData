import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.ADDRESS_LOOKUP_MOCK_MODE !== "false";

/**
 * DAWA is being retired (~2026-08-17) in favor of "Adressevælger", hosted
 * under Datafordeler — same underlying address UUID, different API surface.
 * The env var and function names are deliberately source-agnostic so the
 * eventual cutover to the real Adressevælger endpoint doesn't need a rename;
 * confirm the live response shape against the replacement API (not legacy
 * dawa.aws.dk) before flipping ADDRESS_LOOKUP_MOCK_MODE=false.
 */
const API_BASE = process.env.ADDRESS_LOOKUP_API_BASE ?? "https://api.dataforsyningen.dk/adgangsadresser";

const ZONES = ["byzone", "landzone", "sommerhusomraade"] as const;

export interface AddressCadastral {
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  zone: (typeof ZONES)[number] | null;
}

interface AddressLookupResponse {
  id?: unknown;
  matrikelnr?: unknown;
  ejerlav?: { navn?: unknown } | unknown;
  zone?: unknown;
}

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
 * Looks up the stable address UUID (id_lokalid) plus cadastral parcel
 * (matrikelnr/ejerlav) and zone status for one address. No auth required.
 * Returns a SourceResult so a failure (network, drifted schema) can be
 * counted per-property in ingest.ts without blocking the property upsert.
 */
export async function lookupAddressCadastral(
  address: string,
  postalCode: string | null,
  lat: number,
  lon: number,
): Promise<SourceResult<AddressCadastral>> {
  if (MOCK_MODE) return sourceOk(mockCadastral(address, postalCode));

  try {
    const params = new URLSearchParams({
      q: address,
      ...(postalCode ? { postnr: postalCode } : {}),
      struktur: "mini",
    });
    const results = await fetchJson<AddressLookupResponse[]>(`${API_BASE}?${params}`);
    const match = results[0];
    if (!match) return sourceFailed(`no address match near ${lat},${lon}`);

    const ejerlavRaw = match.ejerlav;
    const ejerlavNavn =
      typeof ejerlavRaw === "object" && ejerlavRaw !== null
        ? asNonEmptyString((ejerlavRaw as Record<string, unknown>).navn)
        : null;

    return sourceOk({
      idLokalid: asNonEmptyString(match.id),
      matrikelnr: asNonEmptyString(match.matrikelnr),
      ejerlav: ejerlavNavn,
      zone: (ZONES as readonly string[]).includes(String(match.zone)) ? (match.zone as AddressCadastral["zone"]) : null,
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

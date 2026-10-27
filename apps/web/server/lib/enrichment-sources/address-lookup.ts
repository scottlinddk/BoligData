import { isDanishCoordinate } from "../shared/map-utils.js";
import { lookupAddressCadastralViaDar, parseStructuredAddress } from "./address-lookup-dar.js";
import { searchHusnummerByAddress } from "./adressevaelger.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "ADDRESS_LOOKUP_MOCK_MODE";

/**
 * Free-text Danish address -> DAR identifiers, cadastral parcel and
 * coordinates, via Datafordeler's DAR GraphQL service
 * (`address-lookup-dar.ts`). DAWA, which this used to call, closed
 * 2026-10-01 and answers HTTP 410.
 *
 * The returned `id` is the DAR *husnummer* UUID, so it is exactly the key
 * `lookupBbr` needs to reach BBR's Bygning entities on Datafordeler — no
 * second resolution step.
 */

const ZONES = ["byzone", "landzone", "sommerhusomraade"] as const;

export interface AddressCadastral {
  /** DAR husnummer UUID — the join key into BBR. */
  idLokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  /** Numeric ejerlav code (e.g. "620551") — jord.miljoeportal.dk's attest link keys off this, not the ejerlav name. */
  ejerlavskode: string | null;
  /** BFE (Bestemt Fast Ejendom) number of the parcel — the key VUR indexes valuations by. */
  bfeNummer: string | null;
  /** Retired upstream with DAWA, so null in practice. Zone status needs a different source (Plandata's zonekort WFS). */
  zone: (typeof ZONES)[number] | null;
  /** Register coordinates of the access point (WGS84). Lets callers geocode from an address alone. */
  lat: number | null;
  lon: number | null;
  postalCode: string | null;
  postalName: string | null;
  municipalityCode: string | null;
  /** The address as the register spells it, e.g. "Floravej 6, 9000 Aalborg". */
  formattedAddress: string | null;
  /** Street and house number as the register spells them. Set only by the Adressevælger path. */
  streetName?: string | null;
  houseNumber?: string | null;
  /**
   * Which upstream actually resolved this address. `"dar"` is Datafordeler's
   * DAR GraphQL service (keyed by `DATAFORDELER_API_KEY`): identity,
   * coordinates and, when unambiguous, the cadastral parcel and BFE number.
   * `"adressevaelger"` is the keyless fallback, resolved from an id the user
   * picked in the Adressevælger autocomplete (`adressevaelger.ts`) or found by
   * its exact search; it carries no parcel, so `matrikelnr`/`ejerlav`/
   * `ejerlavskode`/`bfeNummer`/`zone` stay `null`. `"stored"` is the
   * identifiers an earlier run saved on the property row, used when this
   * run's lookup failed.
   */
  resolvedVia: "dar" | "adressevaelger" | "stored";
}

function mockCadastral(address: string, postalCode: string | null): AddressCadastral {
  const seed = hashSeed(`${address}|${postalCode ?? ""}`);
  return {
    idLokalid: `mock-${seed.toString(16)}`,
    matrikelnr: `${(seed % 900) + 1}${String.fromCharCode(97 + (seed % 26))}`,
    ejerlav: `Mock Ejerlav ${(seed % 50) + 1}`,
    ejerlavskode: String(100000 + (seed % 900000)),
    bfeNummer: String(1_000_000 + (seed % 8_000_000)),
    zone: ZONES[seed % ZONES.length]!,
    lat: 57.0 + (seed % 1000) / 10_000,
    lon: 9.9 + (seed % 1000) / 10_000,
    postalCode,
    postalName: null,
    municipalityCode: null,
    formattedAddress: address,
    resolvedVia: "dar",
  };
}

/**
 * Looks up the DAR husnummer UUID plus cadastral parcel (matrikelnr/ejerlav/
 * BFE) and coordinates for one free-text address. Zone status comes back null
 * (see `AddressCadastral.zone`).
 *
 * `lat`/`lon` are inputs *and* outputs: callers that already know the
 * coordinates pass them so an address the register can't place still yields
 * something usable, and callers that don't get the register's own access
 * point back.
 *
 * DAR needs `DATAFORDELER_API_KEY`. Without one, or when DAR has no unique
 * match or is unreachable, Adressevælger (open, keyless) answers an exact
 * street + number + postcode with identity and coordinates but no parcel.
 * Only fails outright when both paths come up empty.
 */
export async function lookupAddressCadastral(
  address: string,
  postalCode: string | null,
  lat = 0,
  lon = 0,
): Promise<SourceResult<AddressCadastral>> {
  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockCadastral(address, postalCode));

  const fallbackLat = isDanishCoordinate(lat, lon) ? lat : null;
  const fallbackLon = isDanishCoordinate(lat, lon) ? lon : null;

  const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
  const darResult = apiKey
    ? await lookupAddressCadastralViaDar(address, postalCode, apiKey)
    : sourceFailed<AddressCadastral>("DATAFORDELER_API_KEY is not configured");
  if (darResult.ok) {
    const found = darResult.data;
    return sourceOk({ ...found, lat: found.lat ?? fallbackLat, lon: found.lon ?? fallbackLon, postalCode: found.postalCode ?? postalCode });
  }

  const structured = parseStructuredAddress(address, postalCode);
  const adressevaelgerResult = structured
    ? await searchHusnummerByAddress(structured)
    : sourceFailed<AddressCadastral>(`could not parse "${address}" into street + house number`);
  if (adressevaelgerResult.ok) {
    const found = adressevaelgerResult.data;
    return sourceOk({ ...found, lat: found.lat ?? fallbackLat, lon: found.lon ?? fallbackLon, postalCode: found.postalCode ?? postalCode });
  }

  return sourceFailed(`DAR: ${darResult.error}; Adressevælger: ${adressevaelgerResult.error}`);
}

import { asPositiveNumber } from "../crawl/map-utils.js";
import { entityFields, pickField, postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_FLAG = "EJENDOMSVURDERING_MOCK_MODE";

/**
 * VUR (offentlig ejendomsvurdering) via Datafordeler's entity-based GraphQL
 * service — same `graphql.datafordeler.dk/<register>/<version>` pattern and
 * `apiKey` query-param auth as the BBR traversal, reusing
 * DATAFORDELER_API_KEY rather than a separate credential.
 *
 * Keying: VUR indexes valuations by BFE-nummer (Bestemt Fast Ejendom), not by
 * matrikelnr/ejerlav, so `lookupAddressCadastral` now carries the parcel's BFE
 * number through from DAWA and this queries by it when present. The
 * matrikelnr/ejerlav query is kept as the fallback for addresses whose BFE
 * number the address register doesn't return.
 *
 * Field names are read off the live schema rather than guessed. The guessed
 * spellings (`ejendomsvaerdi`, `grundvaerdi`, `vurderingsaar`, plus the
 * bitemporal `registreringstid`/`virkningstid` arguments carried over from the
 * BBR traversal) were all rejected by the register — VUR is not bitemporal in
 * the way DAR/BBR are, and it spells its value fields its own way — and one
 * unknown name costs the whole document. `entityFields` asks the service what
 * `VUR_Ejendomsvurdering` actually has and `pickField` maps this repo's intent
 * onto it, so a rename upstream degrades to a named error instead of an
 * all-null payload.
 *
 * When a value can't be located this reports a failed source and
 * `publicValuation` comes back null; it never falls back to the mock
 * generator, because a plausible-looking fabricated assessed value is worse
 * than no value at all.
 */
const VUR_SERVICE: DatafordelerService = {
  // v2 is the version answering today; the others are only tried if it starts
  // returning 404, which is how a withdrawn version presents.
  register: "VUR",
  versionEnv: "DATAFORDELER_VUR_VERSION",
  baseEnv: "DATAFORDELER_VUR_API_BASE",
  versions: ["v2", "v3", "v1"],
};

const ENTITY_TYPE = "VUR_Ejendomsvurdering";

export interface EjendomsvurderingData {
  /** Assessed total property value (DKK). */
  assessedPropertyValueDkk: number | null;
  /** Assessed land-only value (DKK). */
  assessedLandValueDkk: number | null;
  /** Assessment year — ejerboliger vurderes i ulige år, andre i lige år. */
  valuationYear: number | null;
}

export interface ValuationKey {
  matrikelnr: string | null;
  ejerlav: string | null;
  bfeNummer: string | null;
}

/**
 * The three values this repo needs, resolved to whatever the live schema calls
 * them. Null means the schema has nothing plausibly matching, which is
 * reported rather than papered over.
 */
export interface ValuationFields {
  assessedValue: string | null;
  landValue: string | null;
  year: string | null;
}

/**
 * Spellings tried, in preference order, per value. `pickField` accepts an
 * exact match or a longer field that *starts with* one of these, so
 * `ejendomsvaerdiBeloeb` resolves while an unrelated field merely mentioning
 * "grundvaerdi" does not.
 */
export function selectValuationFields(schema: Set<string>): ValuationFields {
  return {
    assessedValue: pickField(schema, "ejendomsvaerdi", "vurderetejendomsvaerdi", "ejendomsvurderingbeloeb"),
    landValue: pickField(schema, "grundvaerdi", "vurderetgrundvaerdi"),
    year: pickField(schema, "vurderingsaar", "vurderingaar", "vurderingsaartal"),
  };
}

export function buildQuery(key: ValuationKey, fields: ValuationFields): string {
  const where =
    key.bfeNummer !== null
      ? `{ bfeNummer: { eq: ${JSON.stringify(key.bfeNummer)} } }`
      : `{ matrikelnummer: { eq: ${JSON.stringify(key.matrikelnr)} }, ejerlavsnavn: { eq: ${JSON.stringify(key.ejerlav)} } }`;

  const selection = [fields.assessedValue, fields.landValue, fields.year].filter(
    (field): field is string => field !== null,
  );

  return `query Ejendomsvurdering {
  ${ENTITY_TYPE}(where: ${where}) {
    nodes {
      ${selection.join("\n      ")}
    }
  }
}`;
}

interface ValuationData {
  VUR_Ejendomsvurdering?: {
    nodes?: Array<Record<string, unknown>>;
  } | null;
}

/** Reads a resolved field off a node; a value this schema doesn't carry stays null rather than guessed. */
function readField(node: Record<string, unknown>, field: string | null): number | null {
  return field === null ? null : asPositiveNumber(node[field]);
}

/** Keeps the "which fields exist?" diagnostic short enough for the register panel. */
function summarizeSchema(schema: Set<string>): string {
  const names = [...schema];
  const head = names.slice(0, 12).join(", ");
  return names.length > 12 ? `${head}, ... (${names.length} fields)` : head;
}

function mockValuation(seedInput: string): EjendomsvurderingData {
  const seed = hashSeed(seedInput);
  const landValue = 200_000 + (seed % 3_000_000);
  return {
    assessedPropertyValueDkk: landValue + 500_000 + (seed % 4_000_000),
    assessedLandValueDkk: landValue,
    valuationYear: 2024 + (seed % 2),
  };
}

/**
 * Looks up the official public property valuation (ejendomsvurdering) for a
 * parcel, preferring its BFE number and falling back to matrikelnr/ejerlav.
 * A real assessed value is a strong due-diligence signal directly comparable
 * to the listing price — see the caveats above before trusting the live path.
 */
export async function lookupEjendomsvurdering(
  matrikelnr: string | null,
  ejerlav: string | null,
  bfeNummer: string | null = null,
): Promise<SourceResult<EjendomsvurderingData>> {
  const key: ValuationKey = { matrikelnr, ejerlav, bfeNummer };
  const hasKey = bfeNummer !== null || (matrikelnr !== null && ejerlav !== null);
  if (!hasKey) return sourceFailed("no BFE number or matrikelnr/ejerlav to look up");

  if (mockModeEnabled(MOCK_FLAG)) {
    return sourceOk(mockValuation(bfeNummer ?? `${matrikelnr}|${ejerlav}`));
  }

  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) return sourceFailed("DATAFORDELER_API_KEY not configured");

  try {
    const schema = await entityFields(VUR_SERVICE, apiKey, ENTITY_TYPE);
    if (schema === null) {
      return sourceFailed(`${ENTITY_TYPE} is not in the VUR schema (introspection returned no such type)`);
    }

    const fields = selectValuationFields(schema);
    if (fields.assessedValue === null && fields.landValue === null) {
      return sourceFailed(
        `no assessed-value field on ${ENTITY_TYPE}; schema has: ${summarizeSchema(schema)}`,
      );
    }

    const data = await postGraphQl<ValuationData>(VUR_SERVICE, apiKey, buildQuery(key, fields));

    const node = data?.VUR_Ejendomsvurdering?.nodes?.[0];
    if (!node) return sourceFailed(`no valuation found for ${bfeNummer ?? `${matrikelnr}/${ejerlav}`}`);

    return sourceOk({
      assessedPropertyValueDkk: readField(node, fields.assessedValue),
      assessedLandValueDkk: readField(node, fields.landValue),
      valuationYear: readField(node, fields.year),
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

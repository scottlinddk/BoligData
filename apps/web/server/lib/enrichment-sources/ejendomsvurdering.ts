import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString, asPositiveNumber } from "../crawl/map-utils.js";
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
 * Least verified source in the pipeline: the entity and field names below
 * (`VUR_Ejendomsvurdering`, `ejendomsvaerdi`, `grundvaerdi`, `vurderingsaar`)
 * follow the register's documented Danish labels under BBR's ASCII
 * transliteration convention, but were not confirmed against a live schema
 * response — datafordeler.dk is not reachable from this repo's dev sandbox.
 * When they are wrong, this reports a failed source and `publicValuation`
 * comes back null; it never falls back to the mock generator, because a
 * plausible-looking fabricated assessed value is worse than no value at all.
 */
const VUR_VERSION = process.env.DATAFORDELER_VUR_VERSION ?? "v2";
const API_BASE = process.env.DATAFORDELER_VUR_API_BASE ?? `https://graphql.datafordeler.dk/VUR/${VUR_VERSION}`;

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

const VALUE_FIELDS = ["ejendomsvaerdi", "grundvaerdi", "vurderingsaar"] as const;

function buildQuery(key: ValuationKey, tid: string): string {
  const where =
    key.bfeNummer !== null
      ? `{ bfeNummer: { eq: ${JSON.stringify(key.bfeNummer)} } }`
      : `{ matrikelnummer: { eq: ${JSON.stringify(key.matrikelnr)} }, ejerlavsnavn: { eq: ${JSON.stringify(key.ejerlav)} } }`;

  return `query Ejendomsvurdering {
  VUR_Ejendomsvurdering(
    registreringstid: ${JSON.stringify(tid)}
    virkningstid: ${JSON.stringify(tid)}
    where: ${where}
  ) {
    nodes {
      ${VALUE_FIELDS.join("\n      ")}
    }
  }
}`;
}

interface GraphQlResponse {
  data?: {
    VUR_Ejendomsvurdering?: {
      nodes?: Array<Record<string, unknown>>;
    } | null;
  };
  errors?: Array<{ message?: unknown }>;
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
    const params = new URLSearchParams({ apiKey });
    const body = await fetchJson<GraphQlResponse>(`${API_BASE}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: buildQuery(key, new Date().toISOString()) }),
    });

    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => asNonEmptyString(e.message) ?? "unknown GraphQL error").join("; "));
    }

    const node = body.data?.VUR_Ejendomsvurdering?.nodes?.[0];
    if (!node) return sourceFailed(`no valuation found for ${bfeNummer ?? `${matrikelnr}/${ejerlav}`}`);

    return sourceOk({
      assessedPropertyValueDkk: asPositiveNumber(node.ejendomsvaerdi),
      assessedLandValueDkk: asPositiveNumber(node.grundvaerdi),
      valuationYear: asPositiveNumber(node.vurderingsaar),
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

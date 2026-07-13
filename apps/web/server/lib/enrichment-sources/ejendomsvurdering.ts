import { fetchJson } from "../crawl/http.js";
import { asPositiveNumber } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.EJENDOMSVURDERING_MOCK_MODE !== "false";

/**
 * VUR (offentlig ejendomsvurdering) via Datafordeler's entity-based GraphQL
 * service, same `graphql.datafordeler.dk/<register>/<version>` pattern and
 * `apiKey` query-param auth as BBR/Matriklen, reusing DATAFORDELER_API_KEY —
 * no separate credential. Confirmed against Datafordeler's "GraphQL (VUR)"
 * doc (checked 2026-07-13): version v2, entities include `Ejendomsvurdering`
 * (the assessed value itself) and `Vurderingsejendom` (the property the
 * valuation applies to, composed of one or more BFE — Bestemt Fast Ejendom).
 *
 * Biggest open question, unverified: Vurderingsejendom is keyed by BFE-
 * nummer per the doc, not matrikelnr/ejerlav. address-lookup.ts doesn't
 * resolve a BFE number today, so this queries by matrikelnr/ejerlav (the
 * same pair matrikel.ts already uses) on the assumption Jordstykke has a
 * queryable relation back to its Vurderingsejendom — that assumption, plus
 * the exact field names below (ejendomsværdi/grundværdi/vurderingsår are
 * guesses; the objekttypekatalog with real field names wasn't available),
 * must be confirmed against the live schema
 * (https://graphql.datafordeler.dk/VUR/v2/schema?apiKey=...) before flipping
 * EJENDOMSVURDERING_MOCK_MODE=false — if BFE turns out to be required, this
 * needs a BFE lookup added to address-lookup.ts or matrikel.ts first.
 */
const VUR_VERSION = process.env.DATAFORDELER_VUR_VERSION ?? "v2";
const API_BASE = process.env.DATAFORDELER_VUR_API_BASE ?? `https://graphql.datafordeler.dk/VUR/${VUR_VERSION}`;

export interface EjendomsvurderingData {
  /** Assessed total property value (DKK). Field name "ejendomsværdi" is an unverified guess. */
  assessedPropertyValueDkk: number | null;
  /** Assessed land-only value (DKK). Field name "grundværdi" is an unverified guess. */
  assessedLandValueDkk: number | null;
  /** Assessment year — ejerboliger vurderes i ulige år, andre i lige år, per the doc. */
  valuationYear: number | null;
}

const VALUATION_QUERY = `
  query EjendomsvurderingByParcel($matrikelnummer: String!, $ejerlav: String!) {
    VUR_Ejendomsvurdering(where: { matrikelnummer: { eq: $matrikelnummer }, ejerlavsnavn: { eq: $ejerlav } }, first: 1) {
      nodes {
        ejendomsværdi
        grundværdi
        vurderingsår
      }
    }
  }
`;

interface GraphQlResponse {
  data?: {
    VUR_Ejendomsvurdering?: {
      nodes?: Array<{ ejendomsværdi?: unknown; grundværdi?: unknown; vurderingsår?: unknown }>;
    };
  };
  errors?: Array<{ message: string }>;
}

function mockValuation(matrikelnr: string, ejerlav: string): EjendomsvurderingData {
  const seed = hashSeed(`${matrikelnr}|${ejerlav}`);
  const landValue = 200_000 + (seed % 3_000_000);
  return {
    assessedPropertyValueDkk: landValue + 500_000 + (seed % 4_000_000),
    assessedLandValueDkk: landValue,
    valuationYear: 2024 + (seed % 2),
  };
}

/**
 * Looks up the official public property valuation (ejendomsvurdering) for a
 * parcel by matrikelnr/ejerlav. A real assessed value is a strong
 * due-diligence signal directly comparable to the listing price — see the
 * caveats above before relying on the real (non-mock) branch.
 */
export async function lookupEjendomsvurdering(
  matrikelnr: string | null,
  ejerlav: string | null,
): Promise<SourceResult<EjendomsvurderingData>> {
  if (!matrikelnr || !ejerlav) return sourceFailed("no matrikelnr/ejerlav to look up");

  if (MOCK_MODE) return sourceOk(mockValuation(matrikelnr, ejerlav));

  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) return sourceFailed("DATAFORDELER_API_KEY not configured");

  try {
    const params = new URLSearchParams({ apiKey });
    const body = await fetchJson<GraphQlResponse>(`${API_BASE}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: VALUATION_QUERY, variables: { matrikelnummer: matrikelnr, ejerlav } }),
    });

    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    const node = body.data?.VUR_Ejendomsvurdering?.nodes?.[0];
    if (!node) return sourceFailed(`no valuation found for ${matrikelnr}/${ejerlav}`);

    return sourceOk({
      assessedPropertyValueDkk: asPositiveNumber(node.ejendomsværdi),
      assessedLandValueDkk: asPositiveNumber(node.grundværdi),
      valuationYear: asPositiveNumber(node.vurderingsår),
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

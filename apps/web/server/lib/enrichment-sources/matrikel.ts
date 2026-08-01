import { asPositiveNumber } from "../crawl/map-utils.js";
import { postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.MATRIKEL_MOCK_MODE !== "false";

/**
 * Matriklen (the cadastral register, "Matrikel"/"MAT2" in Datafordeler's
 * object type catalog) via the same entity-based GraphQL pattern as BBR
 * (`https://graphql.datafordeler.dk/<register>/<version>`, `apiKey` query
 * param auth — the same DATAFORDELER_API_KEY works across Datafordeler
 * GraphQL services, no separate credential needed). Unlike BBR, Matriklen's
 * `Jordstykke` (land lot) entity is keyed by matrikelnummer/ejerlav, not an
 * address UUID, so this looks up by the matrikelnr/ejerlav pair
 * address-lookup.ts already resolves per property.
 */
const MATRIKEL_SERVICE: DatafordelerService = {
  register: "Matrikel",
  versionEnv: "DATAFORDELER_MATRIKEL_VERSION",
  baseEnv: "DATAFORDELER_MATRIKEL_API_BASE",
  versions: ["v2", "v3", "v1"],
};

/**
 * `registreretAreal` is Jordstykke's registered-area field per the object
 * type catalog (grunddatamodel.datafordeler.dk/objekttypekatalog/Matrikel/Jordstykke.html);
 * confirm this against the live schema
 * (https://graphql.datafordeler.dk/Matrikel/v2/schema?apiKey=...) before
 * flipping MATRIKEL_MOCK_MODE=false — datafordeler.dk isn't reachable from
 * this sandbox to verify directly.
 */
const PARCEL_AREA_QUERY = `
  query MatrikelJordstykkeAreal($matrikelnummer: String!, $ejerlav: String!) {
    Matrikel_Jordstykke(where: { matrikelnummer: { eq: $matrikelnummer }, ejerlavsnavn: { eq: $ejerlav } }, first: 1) {
      nodes {
        registreretAreal
      }
    }
  }
`;

interface JordstykkeData {
  Matrikel_Jordstykke?: {
    nodes?: Array<{ registreretAreal?: unknown }>;
  };
}

/**
 * Looks up the registered land area (registreretAreal) for a parcel by its
 * matrikelnummer/ejerlav. A real registered area is a stronger due-diligence
 * signal for lot size than back-calculating from the listing's building sqm.
 */
export async function lookupMatrikelParcel(
  matrikelnr: string | null,
  ejerlav: string | null,
): Promise<SourceResult<{ registeredAreaSqm: number | null }>> {
  if (!matrikelnr || !ejerlav) return sourceFailed("no matrikelnr/ejerlav to look up");

  if (MOCK_MODE) {
    const seed = hashSeed(`${matrikelnr}|${ejerlav}`);
    return sourceOk({ registeredAreaSqm: 400 + (seed % 2000) });
  }

  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) {
    return sourceFailed("DATAFORDELER_API_KEY not configured");
  }

  try {
    const data = await postGraphQl<JordstykkeData>(MATRIKEL_SERVICE, apiKey, PARCEL_AREA_QUERY, {
      matrikelnummer: matrikelnr,
      ejerlav,
    });

    const node = data?.Matrikel_Jordstykke?.nodes?.[0];
    return sourceOk({ registeredAreaSqm: asPositiveNumber(node?.registreretAreal) });
  } catch (err) {
    return sourceFailed(err);
  }
}

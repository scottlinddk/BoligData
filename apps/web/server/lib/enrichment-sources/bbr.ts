import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.BBR_MOCK_MODE !== "false";

/**
 * BBR (Bygnings- og Boligregistret) via Datafordeler's entity-based GraphQL
 * service (Klimadatastyrelsen "Transitionsguide for GraphQL-tjenester",
 * v2.3, Jan 2025). Endpoint shape is https://graphql.datafordeler.dk/<register>/<version>;
 * BBR isn't access-restricted, so auth is a bare API key passed as the
 * `apiKey` query parameter (username/password "tjenestebruger" login only
 * works for fetching the schema, not for querying entity data — see guide
 * section 3). Requires DATAFORDELER_API_KEY, still pending (same
 * pending-credentials blocker the README documents for BBR/OIS/Vejdirektoratet
 * enrichment generally). Currently mock-only; this client's real branch is a
 * stub until a key exists.
 */
const BBR_VERSION = process.env.DATAFORDELER_BBR_VERSION ?? "v1";
const API_BASE = process.env.DATAFORDELER_BBR_API_BASE ?? `https://graphql.datafordeler.dk/BBR/${BBR_VERSION}`;

const HEATING_TYPES = ["oliefyr", "fjernvarme", "elvarme", "naturgasfyr", "varmepumpe"];

/**
 * `byg056Varmeinstallation` is BBR's well-known REST/Grunddatamodel field
 * code for a building's heating installation; the transition guide's
 * examples cover paging/filtering syntax but not BBR's specific field
 * catalogue, so confirm this against the live schema
 * (https://graphql.datafordeler.dk/BBR/v1/schema?apiKey=...) before flipping
 * BBR_MOCK_MODE=false — datafordeler.dk isn't reachable from this sandbox to
 * verify directly.
 */
const HEATING_QUERY = `
  query BbrBygningVarmeinstallation($idLokalId: String!) {
    BBR_Bygning(where: { id_lokalId: { eq: $idLokalId } }, first: 1) {
      nodes {
        byg056Varmeinstallation
      }
    }
  }
`;

interface GraphQlResponse {
  data?: {
    BBR_Bygning?: {
      nodes?: Array<{ byg056Varmeinstallation?: unknown }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Looks up the BBR heating installation (varmeinstallation) for a property
 * by its address UUID (id_lokalid). A real "oliefyr" (oil furnace) result is
 * a far stronger oilTankRisk signal than the building-year heuristic.
 */
export async function lookupBbr(idLokalid: string | null): Promise<SourceResult<{ heatingInstallation: string | null }>> {
  if (!idLokalid) return sourceFailed("no id_lokalid to look up");

  if (MOCK_MODE) {
    const seed = hashSeed(idLokalid);
    return sourceOk({ heatingInstallation: HEATING_TYPES[seed % HEATING_TYPES.length]! });
  }

  const apiKey = process.env.DATAFORDELER_API_KEY;
  if (!apiKey) {
    return sourceFailed("DATAFORDELER_API_KEY not configured");
  }

  try {
    const params = new URLSearchParams({ apiKey });
    const body = await fetchJson<GraphQlResponse>(`${API_BASE}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: HEATING_QUERY, variables: { idLokalId: idLokalid } }),
    });

    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    const node = body.data?.BBR_Bygning?.nodes?.[0];
    return sourceOk({ heatingInstallation: asNonEmptyString(node?.byg056Varmeinstallation) });
  } catch (err) {
    return sourceFailed(err);
  }
}

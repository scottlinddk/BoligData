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
 *
 * Confirmed against Datafordeler's "GraphQL (BBR)" doc (checked 2026-07-13):
 * newest version is v3, and the top-level entity is `Bygning` (with related
 * entities BBRSag/Ejendomsrelation/Enhed/Grund/GrundJordstykke/TekniskAnlæg
 * etc.), not `BBR_Bygning` as queried below — that doc doesn't list
 * field-level names (byg026Opførelsesår etc.), those live in the separate
 * objekttypekatalog, so BUILDING_QUERY below is still unverified against the
 * real v3 schema and may need both the entity name and field names updated.
 */
const BBR_VERSION = process.env.DATAFORDELER_BBR_VERSION ?? "v3";
const API_BASE = process.env.DATAFORDELER_BBR_API_BASE ?? `https://graphql.datafordeler.dk/BBR/${BBR_VERSION}`;

const HEATING_TYPES = ["oliefyr", "fjernvarme", "elvarme", "naturgasfyr", "varmepumpe"];
const ROOF_MATERIALS = ["tegl", "fibercement", "built-up-tag", "tagpap", "metalplader"];
const WALL_MATERIALS = ["mursten", "letbeton", "træbeklædning", "betonelementer", "pudset mur"];

export interface BbrBuildingData {
  yearBuilt: number | null;
  renovationYear: number | null;
  areaSqm: number | null;
  /** Raw BBR bygningsanvendelse code (e.g. "120"), null until real Datafordeler BBR access lands. */
  buildingType: string | null;
  floors: number | null;
  /** Raw BBR tagdækningsmateriale code/label, null until real Datafordeler BBR access lands. */
  roofMaterial: string | null;
  /** Raw BBR ydervæggens materiale code/label, null until real Datafordeler BBR access lands. */
  wallMaterial: string | null;
  heatingInstallation: string | null;
  /** Basement area in sqm. Real branch returns null until the v3 field name is confirmed against the live schema. */
  basementSqm: number | null;
  /** Water-flushing toilet count — lives on BBR's Enhed entity (enh065), not Bygning; real branch returns null until that lookup exists. */
  toiletCount: number | null;
  /** Bathroom count — lives on BBR's Enhed entity (enh066), not Bygning; real branch returns null until that lookup exists. */
  bathroomCount: number | null;
}

/**
 * Field codes are BBR's well-known REST/Grunddatamodel identifiers for a
 * building's core attributes; the transition guide's examples cover
 * paging/filtering syntax but not BBR's specific field catalogue, so
 * confirm these against the live schema
 * (https://graphql.datafordeler.dk/BBR/v1/schema?apiKey=...) before flipping
 * BBR_MOCK_MODE=false — datafordeler.dk isn't reachable from this sandbox to
 * verify directly.
 */
const BUILDING_QUERY = `
  query BbrBygning($idLokalId: String!) {
    BBR_Bygning(where: { id_lokalId: { eq: $idLokalId } }, first: 1) {
      nodes {
        byg026Opførelsesår
        byg027OmTilbygningsår
        byg038SamletBygningsareal
        byg021BygningensAnvendelse
        byg054AntalEtager
        byg033Tagdækningsmateriale
        byg032YdervæggensMateriale
        byg056Varmeinstallation
      }
    }
  }
`;

interface GraphQlBygningNode {
  byg026Opførelsesår?: unknown;
  byg027OmTilbygningsår?: unknown;
  byg038SamletBygningsareal?: unknown;
  byg021BygningensAnvendelse?: unknown;
  byg054AntalEtager?: unknown;
  byg033Tagdækningsmateriale?: unknown;
  byg032YdervæggensMateriale?: unknown;
  byg056Varmeinstallation?: unknown;
}

interface GraphQlResponse {
  data?: {
    BBR_Bygning?: {
      nodes?: GraphQlBygningNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mockBuildingData(idLokalid: string): BbrBuildingData {
  const seed = hashSeed(idLokalid);
  const yearBuilt = 1890 + (seed % 130);
  return {
    yearBuilt,
    renovationYear: seed % 3 === 0 ? yearBuilt + 20 : null,
    areaSqm: 60 + (seed % 200),
    buildingType: "120",
    floors: 1 + (seed % 3),
    roofMaterial: ROOF_MATERIALS[seed % ROOF_MATERIALS.length]!,
    wallMaterial: WALL_MATERIALS[seed % WALL_MATERIALS.length]!,
    heatingInstallation: HEATING_TYPES[seed % HEATING_TYPES.length]!,
    basementSqm: seed % 2 === 0 ? 20 + (seed % 60) : null,
    toiletCount: 1 + (seed % 3),
    bathroomCount: 1 + (seed % 2),
  };
}

/**
 * Looks up BBR's building-level data (year built, renovation year, area,
 * building use, floors, roof/wall material, heating installation) for a
 * property by its address UUID (id_lokalid). A real "oliefyr" (oil furnace)
 * heating result is a far stronger oilTankRisk signal than the
 * building-year heuristic, and the remaining fields replace listing-derived
 * guesses with the authoritative register values once real access lands.
 */
export async function lookupBbr(idLokalid: string | null): Promise<SourceResult<BbrBuildingData>> {
  if (!idLokalid) return sourceFailed("no id_lokalid to look up");

  if (MOCK_MODE) {
    return sourceOk(mockBuildingData(idLokalid));
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
      body: JSON.stringify({ query: BUILDING_QUERY, variables: { idLokalId: idLokalid } }),
    });

    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }

    const node = body.data?.BBR_Bygning?.nodes?.[0];
    return sourceOk({
      yearBuilt: asNumber(node?.byg026Opførelsesår),
      renovationYear: asNumber(node?.byg027OmTilbygningsår),
      areaSqm: asNumber(node?.byg038SamletBygningsareal),
      buildingType: asNonEmptyString(node?.byg021BygningensAnvendelse),
      floors: asNumber(node?.byg054AntalEtager),
      roofMaterial: asNonEmptyString(node?.byg033Tagdækningsmateriale),
      wallMaterial: asNonEmptyString(node?.byg032YdervæggensMateriale),
      heatingInstallation: asNonEmptyString(node?.byg056Varmeinstallation),
      basementSqm: null,
      toiletCount: null,
      bathroomCount: null,
    });
  } catch (err) {
    return sourceFailed(err);
  }
}

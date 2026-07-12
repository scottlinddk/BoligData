import { fetchJson } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { hashSeed, sourceFailed, sourceOk, type SourceResult } from "./types.js";

const MOCK_MODE = process.env.BBR_MOCK_MODE !== "false";

/**
 * BBR (Bygnings- og Boligregistret) via Datafordeler's GraphQL API. Requires
 * a Datafordeler account (DATAFORDELER_USERNAME/DATAFORDELER_PASSWORD) —
 * same pending-credentials blocker the README already documents for
 * BBR/OIS/Vejdirektoratet enrichment generally. Currently mock-only; this
 * client's real branch is a stub until credentials exist.
 */
const API_BASE = process.env.DATAFORDELER_BBR_API_BASE ?? "https://services.datafordeler.dk/BBR/BBRPublic/1/rest/GetInstance";

const HEATING_TYPES = ["oliefyr", "fjernvarme", "elvarme", "naturgasfyr", "varmepumpe"];

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

  const username = process.env.DATAFORDELER_USERNAME;
  const password = process.env.DATAFORDELER_PASSWORD;
  if (!username || !password) {
    return sourceFailed("DATAFORDELER_USERNAME/DATAFORDELER_PASSWORD not configured");
  }

  try {
    const params = new URLSearchParams({ id: idLokalid, username, password });
    const body = await fetchJson<{ varmeinstallation?: unknown }>(`${API_BASE}?${params}`);
    return sourceOk({ heatingInstallation: asNonEmptyString(body.varmeinstallation) });
  } catch (err) {
    return sourceFailed(err);
  }
}

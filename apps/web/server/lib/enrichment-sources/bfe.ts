import { asNonEmptyString } from "../crawl/map-utils.js";
import { postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";

/**
 * Resolves a parcel's BFE number from a DAR husnummer UUID through BBR:
 * husnummer -> `BBR_Grund.bestemtFastEjendom` (an Ejendomsrelation id) ->
 * `BBR_Ejendomsrelation.bfeNummer`. Field names are the ones
 * `scripts/backfill-bfe-valuation.mjs` uses against Datafordeler's published
 * BBR schema.
 *
 * This exists because VUR indexes valuations by BFE and the address registers
 * that replaced DAWA (Adressevælger, the DAR fallback) do not return one. Without
 * this, every home that is not resolved through DAWA reports VUR unavailable.
 */
const BBR_SERVICE: DatafordelerService = {
  register: "BBR",
  versionEnv: "DATAFORDELER_BBR_VERSION",
  baseEnv: "DATAFORDELER_BBR_API_BASE",
  versions: ["v3", "v2", "v1"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BFE = /^\d{1,12}$/;

interface Nodes {
  nodes?: Array<Record<string, unknown>> | null;
}

/** BBR needs the bitemporal arguments; the helper below retries without them if the schema rejects them. */
function connection(entity: string, tid: string, where: string, fields: string): string {
  return `query Q { ${entity}(registreringstid: ${JSON.stringify(tid)} virkningstid: ${JSON.stringify(tid)} first: 5 where: { ${where} }) { nodes { ${fields} } } }`;
}

export async function lookupBfeByHusnummer(husnummerId: string, apiKey: string): Promise<SourceResult<string>> {
  if (!UUID.test(husnummerId)) return sourceFailed("invalid DAR husnummer UUID");
  const tid = new Date().toISOString();

  try {
    const grunde = await postGraphQl<Record<string, Nodes | null>>(
      BBR_SERVICE,
      apiKey,
      connection("BBR_Grund", tid, `husnummer: { eq: ${JSON.stringify(husnummerId)} }`, "id_lokalId bestemtFastEjendom"),
    );
    const relationIds = [
      ...new Set(
        (grunde?.BBR_Grund?.nodes ?? [])
          .map((node) => asNonEmptyString(node.bestemtFastEjendom))
          .filter((id): id is string => id !== null),
      ),
    ];
    if (relationIds.length === 0) return sourceFailed("no BBR_Grund with a bestemtFastEjendom on this husnummer");

    const bfes = new Set<string>();
    for (const id of relationIds) {
      const relations = await postGraphQl<Record<string, Nodes | null>>(
        BBR_SERVICE,
        apiKey,
        connection("BBR_Ejendomsrelation", tid, `id_lokalId: { eq: ${JSON.stringify(id)} }`, "id_lokalId bfeNummer"),
      );
      for (const node of relations?.BBR_Ejendomsrelation?.nodes ?? []) {
        const value = typeof node.bfeNummer === "number" ? String(node.bfeNummer) : asNonEmptyString(node.bfeNummer);
        if (value !== null && BFE.test(value)) bfes.add(value);
      }
    }
    if (bfes.size === 0) return sourceFailed("no BFE number in BBR for this husnummer");
    if (bfes.size > 1) return sourceFailed(`ambiguous: several BFE numbers (${[...bfes].join(", ")})`);
    return sourceOk([...bfes][0]!);
  } catch (err) {
    return sourceFailed(err);
  }
}

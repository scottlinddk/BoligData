import { getServiceRoleClient } from "../supabase.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";
import { assertRunnerDatabaseConfiguration, isSensitivePlaceholder } from "./runner-config.js";
import { backfillRiskFlags } from "./backfill-risk-flags.js";

/** Actions entry point, loaded with the production environment like run-cli.ts.
 *   --write          persist (default is a dry run that reads and queries registers only)
 *   --only-stale     skip properties whose registers already answered for real
 *   --limit <n>      stop after n properties */
async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit needs a positive integer");

  assertRunnerDatabaseConfiguration();
  if (isSensitivePlaceholder(process.env.DATAFORDELER_API_KEY)) delete process.env.DATAFORDELER_API_KEY;
  if (mockModeEnabled("ENRICH_MOCK_MODE")) throw new Error("Refused: ENRICH_MOCK_MODE is on");

  const summary = await backfillRiskFlags(getServiceRoleClient(), {
    write, limit, onlyStale: args.includes("--only-stale"), log: (line) => console.log(line),
  });
  console.log(JSON.stringify({ event: "backfill.summary", write, ...summary }));
  if (summary.failed > 0 && summary.updated === 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Backfill failed");
  process.exitCode = 1;
});

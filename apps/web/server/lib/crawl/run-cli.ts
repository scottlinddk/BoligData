import { getServiceRoleClient } from "../supabase.js";
import { enabledSources, runIngest } from "./ingest.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";
import { assertRunnerDatabaseConfiguration, configureRunner, isSensitivePlaceholder, runnerOutcome } from "./runner-config.js";
import { verifyCrawlData } from "./runner-verification.js";

/** Actions entry point: Node's --env-file loads the existing Vercel production
 * environment before imports. Never print that environment or save it as an artifact. */
async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const configuration = configureRunner(!verifyOnly && process.argv.includes("--full-scan"), !verifyOnly && process.argv.includes("--weekly"));
  console.log(JSON.stringify({ event: "crawl.runner_config", verifyOnly, sources: enabledSources(), ...configuration }));
  assertRunnerDatabaseConfiguration();
  // A protected optional register credential is unavailable to this runner;
  // never send Vercel's redaction marker to the register as an API key.
  if (isSensitivePlaceholder(process.env.DATAFORDELER_API_KEY)) delete process.env.DATAFORDELER_API_KEY;
  const client = getServiceRoleClient();
  async function verify() {
    console.log(JSON.stringify({ event: "crawl.verification", ...await verifyCrawlData(client) }));
  }
  await verify();
  if (verifyOnly) return;
  if (mockModeEnabled("CRAWL_MOCK_MODE") || mockModeEnabled("ENRICH_MOCK_MODE")) {
    throw new Error("Live refresh refused: disable explicit CRAWL_MOCK_MODE / ENRICH_MOCK_MODE first");
  }
  const result = await runIngest(client);
  const outcome = runnerOutcome(result, configuration.fullScan);
  console.log(JSON.stringify({ event: "crawl.runner_summary", ...outcome, reports: result.reports }));
  if (configuration.fullScan && !outcome.complete) {
    console.error("Full refresh incomplete: inspect source errors, mapping warnings and pagination caps. Saved observations remain valid; unseen listings were not marked sold or removed.");
  }
  await verify();
  if (!outcome.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Crawl runner failed");
  process.exitCode = 1;
});

import { getServiceRoleClient } from "../supabase.js";
import { enabledSources, runIngest } from "./ingest.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";
import { configureRunner } from "./runner-config.js";
import { verifyCrawlData } from "./runner-verification.js";

/** Actions entry point: Node's --env-file loads the existing Vercel production
 * environment before imports. Never print that environment or save it as an artifact. */
async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const configuration = configureRunner(!verifyOnly && process.argv.includes("--full-scan"));
  console.log(JSON.stringify({ event: "crawl.runner_config", verifyOnly, sources: enabledSources(), ...configuration }));
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
  console.log(JSON.stringify({ event: "crawl.runner_summary", ok: result.ok, reports: result.reports }));
  await verify();
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Crawl runner failed");
  process.exitCode = 1;
});

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../server/middleware/cors.js";
import { getServiceRoleClient } from "../server/lib/supabase.js";
import { runIngest } from "../server/lib/crawl/ingest.js";
import { logError } from "../server/lib/crawl/log.js";

/**
 * Daily ingest entry point, triggered by .github/workflows/crawl.yml.
 * Requires SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET to be set in the
 * Vercel project's environment variables. With CRAWL_MOCK_MODE=true (the
 * default), it upserts the fixture listings under server/lib/crawl/fixtures/
 * instead of calling the live Boliga/Boligsiden APIs.
 *
 * Response contract (relied on by the workflow's `curl --fail-with-body`):
 * - 200 { ok: true, reports }  — every source fetched and ingested cleanly
 * - 502 { ok: false, reports } — a source failed or DB writes errored; data
 *   that did land stays landed, and the GitHub Action goes red with the
 *   per-source reports in its log
 * - 500 { error }              — unexpected crash before/around the ingest
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expected = process.env.CRON_SECRET;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const result = await runIngest(getServiceRoleClient());
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    logError("crawl.crashed", err);
    res.status(500).json({ error: "Crawl failed" });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../server/middleware/cors.js";
import { getServiceRoleClient } from "../server/lib/supabase.js";
import { runIngest } from "../server/lib/crawl/ingest.js";
import { logError } from "../server/lib/crawl/log.js";
import { verifyCrawlData } from "../server/lib/crawl/runner-verification.js";

type CrawlRequest = { mode: "verify" } | { mode: "ingest"; batch?: { offset: number; batchSize: number } };

function parseRequest(body: unknown): CrawlRequest | null {
  if (body === undefined || body === null || body === "") return { mode: "ingest" };
  if (typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length === 0) return { mode: "ingest" };
  if (value.mode === "verify" && keys.length === 1) return { mode: "verify" };
  if (keys.length !== 2 || !keys.includes("offset") || !keys.includes("batchSize")) return null;
  const { offset, batchSize } = value;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 50_000 ||
      typeof batchSize !== "number" || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) return null;
  return { mode: "ingest", batch: { offset, batchSize } };
}

/**
 * Daily ingest entry point, triggered by .github/workflows/crawl.yml.
 * Requires SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET to be set in the
 * Vercel project's environment variables. Only with CRAWL_MOCK_MODE=true
 * does it upsert fixture listings under server/lib/crawl/fixtures/
 * instead of calling the live Boliga/Boligsiden APIs.
 *
 * Response contract used by the scheduled workflow:
 * - POST { mode: "verify" } runs SELECT-only, shared-data verification
 * - POST { offset, batchSize } ingests a bounded listing slice (batchSize 1–50)
 * - POST with no body preserves the existing full ingest behavior
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
  const authorization = req.headers.authorization;
  const provided = typeof authorization === "string" ? authorization.trim().match(/^Bearer\s+(\S+)$/i)?.[1] : undefined;
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  const request = parseRequest(req.body);
  if (!request) {
    res.status(400).json({ error: "Use no body, { mode: 'verify' }, or integer offset 0–50000 and batchSize 1–50 together" });
    return;
  }

  try {
    const client = getServiceRoleClient();
    if (request.mode === "verify") {
      const verification = await verifyCrawlData(client);
      res.status(200).json({ ok: true, ...verification });
      return;
    }
    const result = request.batch ? await runIngest(client, request.batch) : await runIngest(client);
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    logError(request.mode === "verify" ? "crawl.verification_failed" : "crawl.crashed", err);
    res.status(500).json({ error: request.mode === "verify" ? "Crawl verification failed" : "Crawl failed" });
  }
}

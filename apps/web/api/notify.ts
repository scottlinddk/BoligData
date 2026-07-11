import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../server/middleware/cors.js";
import { getServiceRoleClient } from "../server/lib/supabase.js";
import { runNotify } from "../server/lib/notify/run.js";
import { logError } from "../server/lib/crawl/log.js";

/**
 * Notification entry point, triggered by .github/workflows/notify.yml.
 * Requires SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, RESEND_API_KEY, and
 * NOTIFY_FROM_EMAIL to be set in the Vercel project's environment variables.
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
    const result = await runNotify(getServiceRoleClient());
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    logError("notify.crashed", err);
    res.status(500).json({ error: "Notify run failed" });
  }
}

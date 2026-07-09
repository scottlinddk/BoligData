import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_ORIGIN = process.env.FRONTEND_URL ?? "*";

/**
 * Applies CORS headers and short-circuits OPTIONS preflight requests.
 * Returns true if the caller should stop processing (preflight handled).
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

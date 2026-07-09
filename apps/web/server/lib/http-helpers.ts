import type { VercelResponse } from "@vercel/node";
import type { ApiErrorResponse } from "../../../../packages/shared/src/types/api";

/**
 * Responds with a generic, client-safe error message (ApiErrorResponse shape)
 * and logs the underlying detail server-side. Raw error/Postgres messages
 * must never reach clients — they leak schema and infrastructure details.
 */
export function sendError(
  res: VercelResponse,
  status: number,
  publicMessage: string,
  err?: unknown,
): void {
  if (err !== undefined) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "api.error",
        status,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
  const body: ApiErrorResponse = { error: publicMessage };
  res.status(status).json(body);
}

/**
 * CDN caching for public, unauthenticated GET endpoints. Listing data only
 * changes on the daily crawl, so short s-maxage + long stale-while-revalidate
 * keeps responses fresh enough while shielding Postgres from repeat reads.
 */
export function setPublicCache(res: VercelResponse, sMaxAgeSeconds: number, swrSeconds: number): void {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=${swrSeconds}`,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

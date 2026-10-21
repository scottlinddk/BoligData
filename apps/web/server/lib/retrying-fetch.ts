/**
 * `fetch` wrapper for long-running batch jobs that talk to Supabase. A crawl
 * issues thousands of PostgREST calls over 20+ minutes, and a single dropped
 * connection ("TypeError: fetch failed") used to fail the whole run.
 *
 * Opt-in (see `getServiceRoleClient({ retryTransient: true })`): only the crawl
 * runner uses it, because it retries non-GET requests after a network error,
 * which is safe for idempotent upserts but not for arbitrary inserts.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD"]);

export interface RetryingFetchOptions {
  /** Total attempts including the first. */
  attempts?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

export function createRetryingFetch(options: RetryingFetchOptions = {}): typeof fetch {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    for (let attempt = 1; ; attempt++) {
      const last = attempt >= attempts;
      try {
        // A Request body can only be consumed once; clone so a retry can resend it.
        const response = await fetchImpl(input instanceof Request ? input.clone() : input, init);
        if (last || !RETRYABLE_STATUSES.has(response.status) || !SAFE_METHODS.has(method)) return response;
      } catch (error) {
        // Caller-initiated aborts are not transient.
        if (last || init?.signal?.aborted) throw error;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs);
    }
  };
}

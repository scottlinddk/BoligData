/**
 * Minimal HTTP toolkit for the crawl clients. Native fetch only (Node 20 /
 * Vercel runtime) — no extra dependencies.
 */

export const CRAWLER_USER_AGENT =
  "BoligDataResearch/0.1 (personal research project; low-volume daily crawl)";

const RETRY_AFTER_CAP_MS = 30_000;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} from ${url}`);
    this.name = "HttpError";
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface FetchJsonOptions {
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
  /** Total attempts (first try + retries). */
  attempts?: number;
  /** Base for exponential backoff between attempts. */
  baseDelayMs?: number;
  headers?: Record<string, string>;
  /** Defaults to GET. */
  method?: string;
  /** Request body, e.g. a JSON-encoded GraphQL {query, variables} payload. */
  body?: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Positive-int env var with default and clamping; tolerates junk values. */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_CAP_MS);
  return null;
}

/**
 * GET a URL and parse the JSON body. Retries (with exponential backoff +
 * jitter, honoring Retry-After) on network errors, timeouts, 429 and 5xx.
 * Non-retryable statuses and exhausted retries throw HttpError / Error.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? envInt("CRAWL_TIMEOUT_MS", 10_000, 1_000, 60_000);
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method,
        body: opts.body,
        signal: controller.signal,
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
          Accept: "application/json",
          ...opts.headers,
        },
      });

      if (!res.ok) {
        const error = new HttpError(res.status, url);
        if (!error.retryable) throw error;
        lastError = error;
        const wait = retryAfterMs(res);
        if (wait !== null) await sleep(wait);
        continue;
      }

      try {
        return (await res.json()) as T;
      } catch (parseErr) {
        throw new Error(
          `Invalid JSON from ${url}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        );
      }
    } catch (err) {
      // HttpError with a non-retryable status and JSON parse failures are
      // deterministic — retrying won't help.
      if (err instanceof HttpError && !err.retryable) throw err;
      if (err instanceof Error && err.message.startsWith("Invalid JSON from")) throw err;
      lastError = err instanceof Error && err.name === "AbortError"
        ? new Error(`Timeout after ${timeoutMs}ms fetching ${url}`)
        : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

import { vi } from "vitest";

/**
 * Test double for the global `fetch` that `crawl/http.ts#fetchJson` calls.
 * Returns just enough of the `Response` surface for `fetchJson`: `ok`,
 * `status`, `headers` (read for Retry-After) and `json()`.
 *
 * Queue one entry per expected request; the last entry repeats once the queue
 * is drained, so a test that only cares about the first response doesn't have
 * to predict the retry count.
 */
export interface StubResponse {
  status?: number;
  /** Parsed JSON body. Ignored when `status` is not 2xx. */
  body?: unknown;
}

export interface FetchStub {
  /** Every URL requested, in order. */
  urls: string[];
  /** Every request body sent, in order (undefined for GETs). */
  bodies: (string | undefined)[];
  restore: () => void;
}

export function stubFetch(responses: StubResponse[]): FetchStub {
  const urls: string[] = [];
  const bodies: (string | undefined)[] = [];
  let call = 0;

  const impl = async (url: unknown, init?: { body?: unknown }) => {
    urls.push(String(url));
    bodies.push(typeof init?.body === "string" ? init.body : undefined);
    const response = responses[Math.min(call++, responses.length - 1)] ?? {};
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => response.body,
    };
  };

  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(impl as unknown as typeof fetch);
  return { urls, bodies, restore: () => spy.mockRestore() };
}

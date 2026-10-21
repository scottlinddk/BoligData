import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch } from "./retrying-fetch.js";

const ok = () => new Response("{}", { status: 200 });

describe("createRetryingFetch", () => {
  it("retries a dropped connection and returns the later success", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok());
    const response = await createRetryingFetch({ fetchImpl, baseDelayMs: 0 })("https://x.test/rest/v1/t", { method: "POST" });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and rethrows", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createRetryingFetch({ fetchImpl, attempts: 3, baseDelayMs: 0 })("https://x.test")).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries 503 on GET but never on a write", async () => {
    const get = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(ok());
    expect((await createRetryingFetch({ fetchImpl: get, baseDelayMs: 0 })("https://x.test")).status).toBe(200);
    const post = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    expect((await createRetryingFetch({ fetchImpl: post, baseDelayMs: 0 })("https://x.test", { method: "POST" })).status).toBe(503);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("does not retry a caller abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(createRetryingFetch({ fetchImpl, baseDelayMs: 0 })("https://x.test", { signal: controller.signal })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

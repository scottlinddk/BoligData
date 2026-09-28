import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError, redactUrl } from "./http.js";
import { stubFetch } from "../test-support/stub-fetch.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("redactUrl", () => {
  it("removes the credential Datafordeler carries in the query string", () => {
    expect(redactUrl("https://graphql.datafordeler.dk/DAR/v3?apiKey=osy65dzsecret")).toBe(
      "https://graphql.datafordeler.dk/DAR/v3?apiKey=redacted",
    );
  });

  it("covers the other credential spellings and userinfo passwords", () => {
    expect(redactUrl("https://x.dk/a?token=abc&api_key=def&password=ghi")).toBe(
      "https://x.dk/a?token=redacted&api_key=redacted&password=redacted",
    );
    expect(redactUrl("https://user:hunter2@x.dk/a")).toBe("https://user:redacted@x.dk/a");
  });

  it("leaves ordinary parameters alone, encoding and all", () => {
    const url = "https://geoserver.plandata.dk/geoserver/wfs?typeNames=stoej%3Alden&bbox=57.03%2C9.9";
    expect(redactUrl(url)).toBe(url);
  });
});

describe("fetchJson error messages", () => {
  it("does not put the API key in the error a failed request throws", async () => {
    stubFetch([{ status: 404 }]);

    const error = await fetchJson("https://graphql.datafordeler.dk/DAR/v1?apiKey=osy65dzsecret", {
      attempts: 1,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as Error).message).toContain("HTTP 404");
    expect((error as Error).message).not.toContain("osy65dzsecret");
  });

  it.each([429, 503])("does not wait for Retry-After on its final attempt after HTTP %s", async status => {
    vi.useFakeTimers();
    const started = Date.now();
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status, headers: { "Retry-After": "30" } }));

    await expect(fetchJson("https://api.boligsiden.dk/search/cases", { attempts: 1, timeoutMs: 6_000 })).rejects.toMatchObject({ status });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Date.now()).toBe(started);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still honors Retry-After when another attempt remains", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(Response.json({ available: true }));
    const pending = fetchJson("https://api.boligsiden.dk/search/cases", { attempts: 2, baseDelayMs: 0 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    await expect(pending).resolves.toEqual({ available: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

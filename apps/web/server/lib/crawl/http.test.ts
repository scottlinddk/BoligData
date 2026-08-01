import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError, redactUrl } from "./http.js";
import { stubFetch } from "../test-support/stub-fetch.js";

afterEach(() => {
  vi.restoreAllMocks();
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
});

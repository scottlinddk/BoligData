import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupNoiseExposure } from "./stoejkort.js";
import { stubFetch } from "../test-support/stub-fetch.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lookupNoiseExposure (live)", () => {
  it("reads Lden off the first matching WFS feature", async () => {
    vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
    const stub = stubFetch([{ body: { features: [{ properties: { lden: 62 } }] } }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok && result.data.ldenDb).toBe(62);
    expect(stub.urls[0]).toContain("typeNames=stoej%3Alden_vej_bane");
  });

  it("asks WFS 2.0.0 for a bbox in the axis order the EPSG:4326 URN mandates", async () => {
    vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
    const stub = stubFetch([{ body: { features: [] } }]);
    await lookupNoiseExposure(57.05, 9.92);

    const url = new URL(stub.urls[0]!);
    expect(url.searchParams.get("version")).toBe("2.0.0");
    const [minLat, minLon, maxLat, maxLon, crs] = url.searchParams.get("bbox")!.split(",");
    // Latitude first: 57 is the latitude, 9.9 the longitude.
    expect(Number(minLat)).toBeCloseTo(57.0495);
    expect(Number(minLon)).toBeCloseTo(9.9195);
    expect(Number(maxLat)).toBeCloseTo(57.0505);
    expect(Number(maxLon)).toBeCloseTo(9.9205);
    expect(crs).toBe("urn:ogc:def:crs:EPSG::4326");
  });

  it("finds the Lden attribute under the publisher's own spelling", async () => {
    vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
    stubFetch([{ body: { features: [{ properties: { objectid: 7, LDEN_DB: "58" } }] } }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok && result.data.ldenDb).toBe(58);
  });

  it("treats no matching feature as 'not noise-exposed', not as a failure", async () => {
    vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
    stubFetch([{ body: { features: [] } }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.ldenDb).toBeNull();
  });

  it("reports an upstream rejection rather than a synthetic dB value", async () => {
    vi.stubEnv("STOEJKORT_TYPENAME", "stoej:lden_vej_bane");
    stubFetch([{ status: 403 }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok).toBe(false);
  });

  it("says the layer is unconfigured instead of guessing one and reporting its HTTP 400", async () => {
    const stub = stubFetch([{ status: 400 }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("STOEJKORT_TYPENAME");
    expect(stub.urls).toHaveLength(0);
  });
});

describe("lookupNoiseExposure (mock mode)", () => {
  it("returns a deterministic Lden value in a realistic dB range for the same point", async () => {
    vi.stubEnv("STOEJKORT_MOCK_MODE", "true");
    const first = await lookupNoiseExposure(57.05, 9.92);
    const second = await lookupNoiseExposure(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.ldenDb).not.toBeNull();
      expect(first.data.ldenDb).toBeGreaterThanOrEqual(40);
      expect(first.data.ldenDb).toBeLessThan(65);
    }
  });

  it("varies with the input point", async () => {
    vi.stubEnv("STOEJKORT_MOCK_MODE", "true");
    const a = await lookupNoiseExposure(57.05, 9.92);
    const b = await lookupNoiseExposure(56.5, 10.5);
    expect(a).not.toEqual(b);
  });
});

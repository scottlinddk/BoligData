import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupNoiseExposure } from "./stoejkort.js";
import { stubFetch } from "../test-support/stub-fetch.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lookupNoiseExposure (live)", () => {
  it("reads Lden off the first matching WFS feature", async () => {
    stubFetch([{ body: { features: [{ properties: { lden: 62 } }] } }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok && result.data.ldenDb).toBe(62);
  });

  it("treats no matching feature as 'not noise-exposed', not as a failure", async () => {
    stubFetch([{ body: { features: [] } }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.ldenDb).toBeNull();
  });

  it("reports an upstream rejection rather than a synthetic dB value", async () => {
    stubFetch([{ status: 403 }]);
    const result = await lookupNoiseExposure(57.05, 9.92);
    expect(result.ok).toBe(false);
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

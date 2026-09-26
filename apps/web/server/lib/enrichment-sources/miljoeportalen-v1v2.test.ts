import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupSoilContamination } from "./miljoeportalen-v1v2.js";
import { fetchJson } from "../crawl/http.js";
vi.mock("../crawl/http.js", () => ({ fetchJson: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("lookupSoilContamination (mock mode)", () => {
  it("returns a deterministic classification for the same point, never 'unknown' in mock mode", async () => {
    vi.stubEnv("MILJOEPORTALEN_MOCK_MODE", "true");
    const first = await lookupSoilContamination(57.05, 9.92);
    const second = await lookupSoilContamination(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(["none", "v1", "v2"]).toContain(first.data.classification);
  });
  it("queries live by default and never calls malformed source output clear", async () => {
    vi.stubEnv("MILJOEPORTALEN_MOCK_MODE", undefined);
    vi.mocked(fetchJson).mockResolvedValueOnce({ error: "unavailable" }).mockResolvedValueOnce({ features: [] });
    expect((await lookupSoilContamination(57.05, 9.92)).ok).toBe(false);
    expect(await lookupSoilContamination(57.05, 9.92)).toEqual({ ok: true, data: { classification: "none" } });
  });
  it("does not ignore a V2 finding after an earlier returned feature", async () => {
    vi.stubEnv("MILJOEPORTALEN_MOCK_MODE", undefined);
    vi.mocked(fetchJson).mockResolvedValue({ features: [{ properties: { klassificering: "V1" } }, { properties: { klassificering: "V2" } }] });
    expect(await lookupSoilContamination(57.05, 9.92)).toEqual({ ok: true, data: { classification: "v2" } });
  });
});

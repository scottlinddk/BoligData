import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupSoilType } from "./geus-jordart.js";
import { fetchJson } from "../crawl/http.js";
vi.mock("../crawl/http.js", () => ({ fetchJson: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("lookupSoilType (mock mode)", () => {
  it("returns a deterministic jordart for the same point", async () => {
    vi.stubEnv("GEUS_MOCK_MODE", "true");
    const first = await lookupSoilType(57.05, 9.92);
    const second = await lookupSoilType(57.05, 9.92);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.jordart).not.toBeNull();
  });
  it("looks up real data when no mock flag is set and rejects error-shaped JSON", async () => {
    vi.stubEnv("GEUS_MOCK_MODE", undefined);
    vi.mocked(fetchJson).mockResolvedValueOnce({ features: [{ attributes: { jordart: "Sand" } }] }).mockResolvedValueOnce({ error: "unavailable" });
    expect(await lookupSoilType(57.05, 9.92)).toEqual({ ok: true, data: { jordart: "Sand" } });
    expect((await lookupSoilType(57.05, 9.92)).ok).toBe(false);
  });
});

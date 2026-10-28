import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDkJordQuery, lookupSoilContamination } from "./miljoeportalen-v1v2.js";
import { fetchJson } from "../shared/http.js";
vi.mock("../shared/http.js", () => ({ fetchJson: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

// Shape of a live DKJord answer (18 Oct 2026), trimmed to the requested properties.
const gasworks = {
  type: "FeatureCollection",
  features: [{ properties: {
    Lokalitetsnr: "851-00149", Lokalitetsnavn: "Nedlagt gasværk, Nyhavnsgade",
    Jordforureningsattester: "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=7000ih;https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=7000ch",
  } }],
};
const empty = { type: "FeatureCollection", features: [] };
const layerOf = (url: string) => new URL(url).searchParams.get("typeNames");

describe("buildDkJordQuery", () => {
  it("asks one layer whether a UTM32 point lies inside a mapped area", () => {
    const url = new URL(buildDkJordQuery("DKJord:View_V2Flader", 556452.94, 6323058.1));
    expect(url.origin + url.pathname).toBe("https://jord.miljoeportal.dk/geo/wfs");
    expect(url.searchParams.get("typeNames")).toBe("DKJord:View_V2Flader");
    expect(url.searchParams.get("CQL_FILTER")).toBe("INTERSECTS(Fladegeometri,SRID=25832;POINT(556452.94 6323058.10))");
  });
});

describe("lookupSoilContamination (live)", () => {
  it("reports V2 with the register's attest link and site name", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => (layerOf(String(url))?.includes("V2") ? gasworks : empty));
    expect(await lookupSoilContamination(57.0475, 9.9305)).toEqual({ ok: true, data: {
      classification: "v2", locationName: "Nedlagt gasværk, Nyhavnsgade",
      attestUrl: "https://jord.miljoeportal.dk/report/?elav=2005051&matrnr=7000ih",
    } });
  });
  it("reports V1 when only the V1 layer has the point", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => (layerOf(String(url))?.includes("V1") ? gasworks : empty));
    const result = await lookupSoilContamination(57.0475, 9.9305);
    expect(result.ok && result.data.classification).toBe("v1");
  });
  it("is clear only when both layers answered with no hit", async () => {
    vi.mocked(fetchJson).mockResolvedValue(empty);
    expect(await lookupSoilContamination(57.03, 9.9)).toEqual({ ok: true, data: { classification: "none", attestUrl: null, locationName: null } });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
  it("fails, never reads clear, when a layer answers with something that is not a feature collection", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => (layerOf(String(url))?.includes("V1") ? { error: "x" } : empty));
    expect((await lookupSoilContamination(57.03, 9.9)).ok).toBe(false);
  });
  it("fails on an upstream error", async () => {
    vi.mocked(fetchJson).mockRejectedValue(new Error("HTTP 503"));
    expect(await lookupSoilContamination(57.03, 9.9)).toEqual({ ok: false, error: "HTTP 503" });
  });
  it("does not query without Danish coordinates", async () => {
    expect((await lookupSoilContamination(0, 0)).ok).toBe(false);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("lookupSoilContamination (mock mode)", () => {
  it("returns a deterministic classification for the same point, never 'unknown'", async () => {
    vi.stubEnv("MILJOEPORTALEN_MOCK_MODE", "true");
    const first = await lookupSoilContamination(57.05, 9.92);
    expect(first).toEqual(await lookupSoilContamination(57.05, 9.92));
    expect(first.ok && ["none", "v1", "v2"].includes(first.data.classification)).toBe(true);
  });
});

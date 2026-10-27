import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNoiseScreeningUrl, lookupNoiseExposure, NOISE_SCREENING_LAYERS, readBand } from "./stoejkort.js";
import { fetchJson } from "../shared/http.js";
vi.mock("../shared/http.js", () => ({ fetchJson: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const empty = { type: "FeatureCollection", features: [] };
const layerOf = (url: unknown) => new URL(String(url)).searchParams.get("typeNames");
/** Answers one layer with these features and every other layer with none. */
function answer(layer: string, features: unknown[]) {
  vi.mocked(fetchJson).mockImplementation(async (url) => (layerOf(url) === layer ? { features } : empty));
}

describe("buildNoiseScreeningUrl", () => {
  it("asks one layer whether a UTM32 point lies in a mapped band", () => {
    const url = new URL(buildNoiseScreeningUrl("stoej:a1_mroad_lden_1_5", 556539.33, 6322502.6));
    expect(url.origin + url.pathname).toBe("https://wfs2-miljoegis.mim.dk/stoej/ows");
    expect(url.searchParams.get("version")).toBe("2.0.0");
    expect(url.searchParams.get("CQL_FILTER")).toBe("INTERSECTS(wkb_geometry,SRID=25832;POINT(556539.33 6322502.60))");
  });
});

describe("readBand", () => {
  it("reads db_low/db_high, and the open top band as no upper bound", () => {
    expect(readBand({ db_low: 60, db_high: 64 }, "roads_in_towns")).toEqual({ lowerDb: 60, upperDb: 64, source: "roads_in_towns" });
    expect(readBand({ db_low: 75, db_high: 99 }, "roads_in_towns")).toEqual({ lowerDb: 75, upperDb: null, source: "roads_in_towns" });
  });
  it("reads the EU class index when a layer has no dB fields (5 = 55–59 … 1 = 75+)", () => {
    expect(readBand({ noise_in: 5 }, "major_rail")).toEqual({ lowerDb: 55, upperDb: 59, source: "major_rail" });
    expect(readBand({ noise_in: 1 }, "major_rail")).toEqual({ lowerDb: 75, upperDb: null, source: "major_rail" });
  });
  it("gives no band for a feature it cannot read, rather than a guessed one", () => {
    expect(readBand({ noise_in: 9 }, "major_rail")).toBeNull();
    expect(readBand({}, "major_rail")).toBeNull();
  });
});

describe("lookupNoiseExposure (live)", () => {
  it("asks every road and rail layer and keeps the loudest band", async () => {
    answer("stoej:b1_dk_aggroad_lden1_5_test", [
      { properties: { db_low: 55, db_high: 59 } }, { properties: { db_low: 65, db_high: 69 } }, { properties: { db_low: 60, db_high: 64 } },
    ]);
    const result = await lookupNoiseExposure(57.0425, 9.9318);
    expect(result).toEqual({ ok: true, data: { ldenDb: 65, band: { lowerDb: 65, upperDb: 69, source: "roads_in_towns" } } });
    expect(vi.mocked(fetchJson).mock.calls.map(([url]) => layerOf(url)).sort()).toEqual(NOISE_SCREENING_LAYERS.map((l) => l.typeName).sort());
  });

  it("asks each layer only for fields it has, since GeoServer answers HTTP 400 to an unknown one", async () => {
    vi.mocked(fetchJson).mockResolvedValue(empty);
    await lookupNoiseExposure(57.05, 9.92);
    const fields = Object.fromEntries(vi.mocked(fetchJson).mock.calls.map(([url]) => [layerOf(url), new URL(String(url)).searchParams.get("propertyName")]));
    expect(fields["stoej:a1_mroad_lden_1_5"]).toBe("db_low,db_high,noise_in");
    expect(fields["stoej:c1_bdk_mrail_lden_1_5"]).toBe("noise_in");
    expect(fields["stoej:d1_mtr_agg_rail_lden_1_5"]).toBe("noise_in");
  });

  it("reports a louder rail band over a road band", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) =>
      layerOf(url) === "stoej:c1_bdk_mrail_lden_1_5" ? { features: [{ properties: { noise_in: 3 } }] }
        : layerOf(url) === "stoej:a1_mroad_lden_1_5" ? { features: [{ properties: { db_low: 55, db_high: 59 } }] } : empty);
    const result = await lookupNoiseExposure(57.0425, 9.9318);
    expect(result.ok && result.data.band).toEqual({ lowerDb: 65, upperDb: 69, source: "major_rail" });
  });

  it("treats no band on any layer as 'not in a mapped noise zone', not as a failure", async () => {
    vi.mocked(fetchJson).mockResolvedValue(empty);
    expect(await lookupNoiseExposure(57.0135, 9.763)).toEqual({ ok: true, data: { ldenDb: null, band: null } });
  });

  it("fails the whole lookup when one layer fails, so a gap never reads as quiet", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (layerOf(url) === "stoej:a1_mroad_lden_1_5") throw new Error("HTTP 503");
      return empty;
    });
    expect(await lookupNoiseExposure(57.05, 9.92)).toEqual({ ok: false, error: "HTTP 503" });
  });

  it("fails on an answer that is not a feature collection", async () => {
    vi.mocked(fetchJson).mockResolvedValue({ error: "x" });
    expect((await lookupNoiseExposure(57.05, 9.92)).ok).toBe(false);
  });

  it("does not query without Danish coordinates", async () => {
    expect((await lookupNoiseExposure(0, 0)).ok).toBe(false);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe("lookupNoiseExposure (mock mode)", () => {
  it("returns a deterministic Lden value in a realistic dB range for the same point", async () => {
    vi.stubEnv("STOEJKORT_MOCK_MODE", "true");
    const first = await lookupNoiseExposure(57.05, 9.92);
    expect(first).toEqual(await lookupNoiseExposure(57.05, 9.92));
    expect(first.ok && first.data.ldenDb).toBeGreaterThanOrEqual(40);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

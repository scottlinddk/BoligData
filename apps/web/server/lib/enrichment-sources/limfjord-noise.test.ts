import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLimfjordRequest, lookupLimfjordNoise, parseLimfjordReport } from "./limfjord-noise.js";
import { accessAddressId, limfjordReportFixture } from "../test-support/limfjord-report.js";

const property = { idLokalid: accessAddressId, address: "Slåenvej 18", postalCode: "9000", lat: 57.03, lon: 9.9 };
const apiUrl = buildLimfjordRequest(property, "en")!.href;
afterEach(() => vi.unstubAllGlobals());

describe("Tredjekort address-level contour reports", () => {
  it("uses the access-address UUID or exact text with postcode, without guessing a nearby address", () => {
    expect(new URL(apiUrl).searchParams.get("id")).toBe(accessAddressId);
    expect(new URL(apiUrl).searchParams.has("address")).toBe(false);
    const textUrl = buildLimfjordRequest({ ...property, idLokalid: null }, "da")!;
    expect(textUrl.searchParams.get("address")).toBe("Slåenvej 18, 9000");
    expect(textUrl.searchParams.get("lang")).toBe("da");
    expect(buildLimfjordRequest({ ...property, idLokalid: null, address: "*" }, "en")).toBeNull();
  });

  it("preserves scenario bands and years, source dates, current PDF links and rounded design proximity", () => {
    const report = parseLimfjordReport(limfjordReportFixture(), "en", apiUrl)!;
    expect(report.scenarios.map(scenario => scenario.scenario)).toEqual(["original", "reference", "variant"]);
    expect(report.scenarios[0]).toMatchObject({ modelYear: 2021, forecastYear: 2040, band: { lowerDb: 58, upperDb: 63 } });
    expect(report.officialDesignDistanceMeters).toBe(590);
    expect(report.officialDocuments[0]).toMatchObject({ forecastYear: 2035, title: "Fjord · with project" });
    expect(report.datasetReviewedAt).toBe("2026-09-26");
    expect(new URL(report.mapUrl).searchParams.get("address.q")).toBe("Slåenvej 18, 9000 Aalborg");
    expect(JSON.stringify(report)).not.toContain("large geometry");
    expect(report).not.toHaveProperty("ldenDb");
  });

  it.each(["no_matching_contour", "boundary", "overlapping_bands", "source_geometry_invalid"])("keeps %s uncertain instead of inventing a noise value", status => {
    const fixture = limfjordReportFixture();
    const raw = { ...fixture, noise: { ...fixture.noise, legacyModel: { scenarios: fixture.noise.legacyModel.scenarios.map(scenario => ({
      ...scenario, status, band: null, onBoundary: status === "boundary",
      candidateBands: status === "boundary" || status === "overlapping_bands" ? [scenario.band] : [],
    })) } } };
    const report = parseLimfjordReport(raw, "en", apiUrl)!;
    expect(report.scenarios[0]?.status).toBe(status);
    expect(report.scenarios.every(scenario => scenario.band === null)).toBe(true);
  });

  it("preserves the open-ended source top category", () => {
    const fixture = limfjordReportFixture();
    const raw = { ...fixture, noise: { ...fixture.noise, legacyModel: { scenarios: fixture.noise.legacyModel.scenarios.map(scenario => ({
      ...scenario, band: { lowerDb: 78, upperDb: null, label: "78 dB" },
    })) } } };
    expect(parseLimfjordReport(raw, "en", apiUrl)?.scenarios[0]?.band).toEqual({ lowerDb: 78, upperDb: null, label: "78 dB" });
  });

  it.each([
    { modelYear: 2025 }, { forecastYear: 2035 }, { metric: "Lnight" }, { units: "m" },
    { status: "boundary" }, { onBoundary: true }, { belowMappedThreshold: true },
    { sourceGeometryIssueFeatureIds: ["invalid-polygon"] },
    { band: { lowerDb: 63, upperDb: 58, label: "bad band" } },
  ])("rejects incompatible or contradictory contour semantics %j", changes => {
    const fixture = limfjordReportFixture();
    Object.assign(fixture.noise.legacyModel.scenarios[0]!, changes);
    expect(parseLimfjordReport(fixture, "en", apiUrl)).toBeNull();
  });

  it("filters unsafe or unrelated document links and hides distance without documented design semantics", () => {
    const fixture = limfjordReportFixture();
    fixture.noise.officialDocuments[0]!.url = "javascript:alert(1)";
    fixture.proximity.nearestOfficialDesign.includesRampsAndLocalRoads = false;
    const report = parseLimfjordReport(fixture, "en", apiUrl)!;
    expect(report.officialDocuments).toEqual([]);
    expect(report.officialDesignDistanceMeters).toBeNull();
  });

  it("does not relabel a changed design dataset as the 2025 design", () => {
    const fixture = limfjordReportFixture();
    fixture.proximity.nearestOfficialDesign.source.sourceUpdatedAt = "2026-09-28";
    expect(parseLimfjordReport(fixture, "en", apiUrl)?.officialDesignDistanceMeters).toBeNull();
  });

  it.each([[404, "address_not_found"], [409, "address_ambiguous"], [502, "upstream_unavailable"], [504, "upstream_unavailable"]])("isolates upstream HTTP %s", async (status, reason) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: Number(status) }));
    vi.stubGlobal("fetch", fetch);
    expect(await lookupLimfjordNoise(property, "en")).toMatchObject({ status: "unavailable", reason });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("isolates timeout/network failures and malformed data without leaking upstream text", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new DOMException("private upstream detail", "AbortError"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "private upstream detail" })));
    vi.stubGlobal("fetch", fetch);
    expect(await lookupLimfjordNoise(property, "en")).toMatchObject({ status: "unavailable", reason: "upstream_unavailable" });
    expect(await lookupLimfjordNoise(property, "en")).toMatchObject({ status: "unavailable", reason: "invalid_response" });
  });

  it("rejects the wrong UUID or a distant text match", async () => {
    const fixture = limfjordReportFixture();
    fixture.address.id = "0a3f509c-915c-32b8-e044-0003ba298018";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(fixture)))));
    expect(await lookupLimfjordNoise(property, "en")).toMatchObject({ reason: "address_mismatch" });
    fixture.address.latitude = 55.67;
    expect(await lookupLimfjordNoise({ ...property, idLokalid: null }, "en")).toMatchObject({ reason: "address_mismatch" });
  });

  it("successfully retrieves a validated report with a bounded request", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(limfjordReportFixture())));
    vi.stubGlobal("fetch", fetch);
    expect(await lookupLimfjordNoise(property, "en")).toMatchObject({ status: "available", report: { address: { id: accessAddressId } } });
    expect(fetch).toHaveBeenCalledWith(apiUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});

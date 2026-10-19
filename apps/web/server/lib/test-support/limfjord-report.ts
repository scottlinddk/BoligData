export const accessAddressId = "0a3f509c-b58c-32b8-e044-0003ba298018";
export function limfjordReportFixture() {
  return {
    schemaVersion: "1.0", language: "en",
    address: { id: accessAddressId, text: "Slåenvej 18, 9000 Aalborg", latitude: 57.03, longitude: 9.9, precision: "access_address" },
    noise: {
      status: "legacy_model_available", ldenDb: null, audible: null, exceedsGuideline: null,
      current2035: { status: "address_level_contours_unavailable", band: null },
      legacyModel: { scenarios: ["original", "variant", "reference"].map(scenario => ({
        scenario, status: "band_found", modelYear: 2021, forecastYear: 2040,
        metric: "Lden", units: "dB(A)", band: { lowerDb: 58, upperDb: 63, label: "58–63 dB" },
        candidateBands: [], onBoundary: false, belowMappedThreshold: null, sourceGeometryIssueFeatureIds: [],
        sourceUrl: "https://www.vejdirektoratet.dk/vvm/limfjorden/miljoe/stoej",
      })) },
      officialDocuments: [{ title: { da: "Fjord · med projekt", en: "Fjord · with project" }, forecastYear: 2035, url: "https://api.vejdirektoratet.dk/map.pdf" }],
    },
    proximity: { nearestOfficialDesign: { distanceMeters: 590, includesRampsAndLocalRoads: true, source: { sourceUpdatedAt: "2025-06-11 11:52" }, geometry: "large geometry not forwarded" } },
    provenance: { datasetReviewedAt: "2026-09-26" },
  };
}

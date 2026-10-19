export type LimfjordLanguage = "da" | "en";
export type LimfjordScenarioId = "original" | "reference" | "variant";
export type LimfjordNoiseStatus = "band_found" | "no_matching_contour" | "boundary" | "overlapping_bands" | "source_geometry_invalid";

export interface LimfjordNoiseBand {
  lowerDb: number;
  upperDb: number | null;
  label: string;
}

export interface LimfjordNoiseScenario {
  scenario: LimfjordScenarioId;
  status: LimfjordNoiseStatus;
  modelYear: 2021;
  forecastYear: 2040;
  band: LimfjordNoiseBand | null;
  candidateBands: LimfjordNoiseBand[];
  sourceUrl: string | null;
}

/** A compact view of the historical contour API, never an exact or motorway-only dB estimate. */
export interface LimfjordNoiseReport {
  address: { id: string; text: string };
  scenarios: LimfjordNoiseScenario[];
  officialDesignDistanceMeters: number | null;
  officialDocuments: { title: string; url: string; forecastYear: 2035 }[];
  datasetReviewedAt: string | null;
  mapUrl: string;
  apiUrl: string;
}

export type LimfjordUnavailableReason = "address_missing" | "address_not_found" | "address_ambiguous" | "address_mismatch" | "upstream_unavailable" | "invalid_response";
export type LimfjordNoiseResult = {
  status: "available";
  checkedAt: string;
  report: LimfjordNoiseReport;
} | {
  status: "unavailable";
  checkedAt: string;
  reason: LimfjordUnavailableReason;
};

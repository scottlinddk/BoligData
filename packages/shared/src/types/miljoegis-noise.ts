export type NoiseMetric = "Lden" | "Lnight";
export type NoiseSource = "urban_roads" | "state_roads" | "bridge_roads" | "railways" | "local_railways" | "bridge_railways";
export interface MappedNoiseBand { lowerDb: number; upperDb: number | null }
export interface NoiseLayerResult {
  source: NoiseSource;
  metric: NoiseMetric;
  layer: string;
  status: "band_found" | "no_contour" | "boundary" | "overlapping_bands" | "unavailable";
  bands: MappedNoiseBand[];
  reason: "upstream_unavailable" | "invalid_response" | "response_limit" | null;
}
export interface MiljoegisNoiseReport {
  status: "available" | "unavailable";
  reason: "coordinates_missing" | "nonlive_data" | "upstream_unavailable" | null;
  checkedAt: string;
  mappingYear: 2022;
  calculationMethod: "Nord2000";
  heightMeters: 1.5;
  coordinates: { latitude: number; longitude: number } | null;
  mapUrl: string;
  layers: NoiseLayerResult[];
}

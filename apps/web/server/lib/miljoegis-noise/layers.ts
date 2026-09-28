import type { NoiseMetric, NoiseSource } from "../../../../../packages/shared/src/types/miljoegis-noise.js";

/** Verified against MiljøGIS /rest/profile/noise/themes/all, 28 September 2026.
 * All these DK layers are 2022 Nord2000 calculations at 1.5 m. EU/older layers
 * deliberately remain separate; see docs/miljoegis-noise.md for source evidence.
 */
const SOURCES: [NoiseSource, string][] = [
  ["urban_roads", "vej"], ["state_roads", "stoerre_veje"], ["bridge_roads", "sogb_veje"],
  ["railways", "jernbane"], ["local_railways", "mll_bane"], ["bridge_railways", "sogb_bane"],
];
export const NOISE_LAYERS = SOURCES.flatMap(([source, name]) => (["Lden", "Lnight"] as NoiseMetric[]).map(metric => ({
  source, metric, layer: `ds_dk_2022_noise_${name}${metric === "Lnight" ? "_nat" : ""}_1_5m`,
  theme: `theme-dk_noise2022_${name}${metric === "Lnight" ? "_nat" : ""}_1_5m`,
  // Official GetLegendGraphic images, independently checked for all 12 layers.
  lowestBand: metric === "Lnight" ? 45 : source.endsWith("railways") ? 54 : 53,
})));
export const MILJOEGIS_ORIGIN = "https://miljoegis.mim.dk";

import type { Property } from "../../../../../packages/shared/src/types/index.js";
import type {
  LimfjordLanguage, LimfjordNoiseBand, LimfjordNoiseReport, LimfjordNoiseResult,
  LimfjordNoiseScenario, LimfjordNoiseStatus, LimfjordScenarioId, LimfjordUnavailableReason,
} from "../../../../../packages/shared/src/types/limfjord-noise.js";
import { fetchJson, HttpError } from "../crawl/http.js";
import { isUuid } from "../http-helpers.js";

// Verified from the Tredjekort repository homepage and live API, 2026-09-28.
const BASE = "https://tredjekort.vercel.app";
type ListingAddress = Pick<Property, "idLokalid" | "address" | "postalCode" | "lat" | "lon">;
const scenarioIds: LimfjordScenarioId[] = ["original", "reference", "variant"];
const statuses: LimfjordNoiseStatus[] = ["band_found", "no_matching_contour", "boundary", "overlapping_bands", "source_geometry_invalid"];
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function officialUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["www.vejdirektoratet.dk", "api.vejdirektoratet.dk", "vejdirektoratet.dk"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

function parseBand(value: unknown): LimfjordNoiseBand | null {
  const band = record(value);
  if (!band || !finite(band.lowerDb) || band.lowerDb < 0 || band.lowerDb > 150 ||
    (band.upperDb !== null && (!finite(band.upperDb) || band.upperDb <= band.lowerDb || band.upperDb > 150)) || !text(band.label)) return null;
  return { lowerDb: band.lowerDb, upperDb: band.upperDb as number | null, label: text(band.label)! };
}

function parseScenario(value: unknown): LimfjordNoiseScenario | null {
  const raw = record(value);
  if (!raw || !scenarioIds.includes(raw.scenario as LimfjordScenarioId) || !statuses.includes(raw.status as LimfjordNoiseStatus) ||
    raw.modelYear !== 2021 || raw.forecastYear !== 2040 || raw.metric !== "Lden" || raw.units !== "dB(A)" ||
    raw.belowMappedThreshold !== null || !Array.isArray(raw.candidateBands)) return null;
  const band = parseBand(raw.band);
  const candidateBands = raw.candidateBands.map(parseBand);
  // Never turn uncertain source states into a definitive noise band.
  if ((raw.status === "band_found" && (!band || raw.onBoundary !== false || !Array.isArray(raw.sourceGeometryIssueFeatureIds) || raw.sourceGeometryIssueFeatureIds.length !== 0)) ||
    (raw.status !== "band_found" && raw.band !== null) || candidateBands.some(item => item === null)) return null;
  return {
    scenario: raw.scenario as LimfjordScenarioId, status: raw.status as LimfjordNoiseStatus,
    modelYear: 2021, forecastYear: 2040, band,
    candidateBands: candidateBands as LimfjordNoiseBand[], sourceUrl: officialUrl(raw.sourceUrl),
  };
}

export function buildLimfjordRequest(property: ListingAddress, language: LimfjordLanguage): URL | null {
  const url = new URL("/api/address-report", BASE);
  if (property.idLokalid && isUuid(property.idLokalid)) url.searchParams.set("id", property.idLokalid);
  else {
    let address = property.address?.trim();
    if (!address) return null;
    if (property.postalCode && /^\d{4}$/.test(property.postalCode) && !new RegExp(`\\b${property.postalCode}\\b`).test(address)) address += `, ${property.postalCode}`;
    if (address.length < 3 || address.length > 200 || /[\x00-\x1f\x7f*]/.test(address)) return null;
    url.searchParams.set("address", address);
  }
  url.searchParams.set("lang", language);
  return url;
}

/** Strip upstream geometries/project metadata, and reject incompatible semantics rather than silently reinterpret them. */
export function parseLimfjordReport(raw: unknown, language: LimfjordLanguage, apiUrl: string): LimfjordNoiseReport | null {
  const data = record(raw);
  const address = record(data?.address);
  const noise = record(data?.noise);
  const current = record(noise?.current2035);
  if (!data || data.schemaVersion !== "1.0" || data.language !== language || !address || !isUuid(String(address.id ?? "")) ||
    !text(address.text) || address.precision !== "access_address" || !finite(address.latitude) || !finite(address.longitude) ||
    address.latitude < 54 || address.latitude > 58 || address.longitude < 7 || address.longitude > 16 ||
    !noise || noise.ldenDb !== null || noise.audible !== null || noise.exceedsGuideline !== null ||
    current?.status !== "address_level_contours_unavailable" || current.band !== null) return null;
  if (noise.status !== (noise.legacyModel === null ? "official_address_level_data_unavailable" : "legacy_model_available")) return null;
  let scenarios: LimfjordNoiseScenario[] = [];
  if (noise.legacyModel !== null) {
    const model = record(noise.legacyModel);
    if (!model || !Array.isArray(model.scenarios) || model.scenarios.length !== 3) return null;
    const parsed = model.scenarios.map(parseScenario);
    if (parsed.some(item => !item) || new Set(parsed.map(item => item?.scenario)).size !== 3) return null;
    scenarios = (parsed as LimfjordNoiseScenario[]).sort((a, b) => scenarioIds.indexOf(a.scenario) - scenarioIds.indexOf(b.scenario));
  }
  const design = record(record(data.proximity)?.nearestOfficialDesign);
  const distance = design?.distanceMeters;
  const designSourceDate = text(record(design?.source)?.sourceUpdatedAt);
  const officialDocuments: LimfjordNoiseReport["officialDocuments"] = [];
  for (const item of Array.isArray(noise.officialDocuments) ? noise.officialDocuments : []) {
    const doc = record(item);
    const url = officialUrl(doc?.url);
    const title = text(record(doc?.title)?.[language]);
    if (doc?.forecastYear === 2035 && url && title) officialDocuments.push({ title, url, forecastYear: 2035 });
  }
  const map = new URL(BASE);
  map.searchParams.set("address.q", String(address.text));
  map.searchParams.set("noiseScenario", "original");
  const reviewed = text(record(data.provenance)?.datasetReviewedAt);
  return {
    address: { id: String(address.id), text: String(address.text) }, scenarios,
    officialDesignDistanceMeters: finite(distance) && distance >= 0 && distance % 10 === 0 &&
      design?.includesRampsAndLocalRoads === true && designSourceDate?.startsWith("2025-") ? distance : null,
    officialDocuments, datasetReviewedAt: reviewed && /^\d{4}-\d{2}-\d{2}$/.test(reviewed) ? reviewed : null,
    mapUrl: map.href, apiUrl,
  };
}

export async function lookupLimfjordNoise(property: ListingAddress, language: LimfjordLanguage): Promise<LimfjordNoiseResult> {
  const checkedAt = new Date().toISOString();
  const unavailable = (reason: LimfjordUnavailableReason): LimfjordNoiseResult => ({ status: "unavailable", checkedAt, reason });
  const url = buildLimfjordRequest(property, language);
  if (!url) return unavailable("address_missing");
  try {
    const raw = await fetchJson(url.href, { timeoutMs: 10_000, attempts: 1 });
    const report = parseLimfjordReport(raw, language, url.href);
    if (!report) return unavailable("invalid_response");
    if (url.searchParams.has("id") && report.address.id.toLowerCase() !== property.idLokalid!.toLowerCase()) return unavailable("address_mismatch");
    // Guard text fallback against a similarly named street in another town.
    // Listings without valid Danish coordinates still benefit from the source's exact, non-fuzzy address resolution.
    const resolved = record(record(raw)?.address)!;
    if (finite(property.lat) && finite(property.lon) && property.lat >= 54 && property.lat <= 58 && property.lon >= 7 && property.lon <= 16) {
      const north = (Number(resolved.latitude) - property.lat) * 111_320;
      const east = (Number(resolved.longitude) - property.lon) * 111_320 * Math.cos(property.lat * Math.PI / 180);
      if (Math.hypot(north, east) > 250) return unavailable("address_mismatch");
    }
    return { status: "available", checkedAt, report };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return unavailable("address_not_found");
    if (error instanceof HttpError && error.status === 409) return unavailable("address_ambiguous");
    return unavailable("upstream_unavailable");
  }
}

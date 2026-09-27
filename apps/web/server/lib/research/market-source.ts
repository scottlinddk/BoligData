import type { ResearchHistoryResponse } from "../../../../../packages/shared/src/types/research-api.js";
import type { PropertyType } from "../../../../../packages/shared/src/types/index.js";
import { mapRegistrations } from "../crawl/boligsiden.js";
import { fetchJson } from "../crawl/http.js";
import { isDanishCoordinate } from "../crawl/map-utils.js";
import { haversineMeters } from "../row-mappers.js";
import { mockModeEnabled } from "../enrichment-sources/types.js";

type Transaction = ResearchHistoryResponse["transactions"][number];
export interface MarketSubject {
  id: string; address: string; municipality: string; property_type: PropertyType; postal_code: string;
  lat: number; lon: number; data_mode: string;
}
const TYPES: Record<string, PropertyType> = { villa: "villa", condo: "apartment", "terraced house": "terraced_house", "holiday house": "summer_house", farm: "farm", "villa apartment": "villa_apartment", cooperative: "cooperative", "cooperative housing": "cooperative" };
const record = (value: unknown): Record<string, any> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const streetKey = (value: string) => value.split(",")[0]!.toLocaleLowerCase("da-DK").replace(/[^\p{L}\p{N}]/gu, "");

/** A separate population of registered sales, including homes no longer advertised.
 * Never merge it with listing-derived rows by approximate address. Stable source
 * address + day identities let the analysis engine reject conflicting registrations.
 */
export function mapMarketAddresses(raw: unknown[], subject: MarketSubject, saleFrom: string, observedAt: string): Transaction[] {
  const rows: Transaction[] = [];
  for (const value of raw) {
    const address = record(value);
    if (!address || !uuid(address.addressID) || TYPES[address.addressType] !== subject.property_type || String(address.zipCode) !== subject.postal_code) continue;
    const municipality = text(record(address.municipality)?.name);
    if (!municipality || municipality.toLocaleLowerCase("da-DK") !== subject.municipality.toLocaleLowerCase("da-DK")) continue;
    const coordinates = record(address.coordinates);
    const lat = coordinates?.lat, lon = coordinates?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !isDanishCoordinate(lat, lon)) continue;
    // An exact subject address UUID is not yet persisted. Conservatively exclude
    // the whole immediate vicinity, including colocated units, from comparisons.
    if (haversineMeters(subject.lat, subject.lon, lat, lon) <= 20) continue;
    const road = text(record(address.road)?.name) ?? text(address.roadName);
    const houseNumber = text(address.houseNumber);
    if (!road || !houseNumber) continue;
    // This is a conservative exclusion, never an identity join. Also remove
    // an exact street/number match if the source coordinates have shifted.
    const candidateStreet = streetKey(`${road} ${houseNumber}`);
    if (streetKey(subject.address) === candidateStreet) continue;
    const unit = [text(address.floor), text(address.door)].filter(Boolean).join(" ");
    const label = `${road} ${houseNumber}${unit ? `, ${unit}` : ""}, ${subject.postal_code} ${text(address.cityName) ?? municipality}`;
    const propertyId = `boligsiden-address:${address.addressID.toLowerCase()}`;
    for (const sale of mapRegistrations(address.registrations)) {
      if (sale.soldDate < saleFrom || sale.soldDate > observedAt.slice(0, 10)) continue;
      const identity = `${propertyId}:${sale.soldDate}:day`;
      // Keep every conflicting source row. Exact copies can share this key;
      // differing price/type/area rows must remain visible to conflict detection.
      rows.push({
        id: `${identity}:${sale.registrationId ?? "no-id"}:${sale.price}:${sale.saleType}:${sale.residentialArea ?? "?"}`,
        transactionIdentity: identity, propertyId, unitId: address.addressID.toLowerCase(), address: label,
        municipality, postalCode: subject.postal_code, propertyType: subject.property_type, lat, lon,
        saleType: sale.saleType ?? null, saleDate: sale.soldDate, datePrecision: "day", saleDateEnd: null,
        observedAt, soldPrice: sale.price, residentialArea: sale.residentialArea ?? null,
        areaDefinition: sale.areaDefinition ?? "unknown", areaAtSale: sale.areaDefinition === "residential",
        areaEvidence: sale.residentialArea ? "reported" : "unknown", firstAsking: null, lastAsking: null,
        activeDays: null, latestEpisodeDays: null, calendarDays: null, condition: null,
        dataMode: "live", status: "sold", source: "boligsiden",
        sourceUrl: null,
      });
    }
  }
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

export interface MarketSourceResult { transactions: Transaction[]; truncated: boolean; status: "available" | "unavailable" }
/** Short shared cache holds public evidence only. Failures are never cached as sales. */
const cache = new Map<string, { expires: number; body: unknown[]; truncated: boolean; observedAt: string }>();
export async function fetchMarketSales(subject: MarketSubject, saleFrom: string): Promise<MarketSourceResult> {
  const unavailable: MarketSourceResult = { transactions: [], truncated: false, status: "unavailable" };
  if (subject.data_mode !== "real" || !text(subject.address) || !/^\d{4}$/.test(subject.postal_code ?? "") || !subject.municipality ||
      !isDanishCoordinate(subject.lat, subject.lon) || mockModeEnabled("BOLIGSIDEN_SALES_MOCK_MODE")) return unavailable;
  const endpoint = process.env.BOLIGSIDEN_ADDRESS_API_BASE?.trim() || "https://api.boligsiden.dk/search/addresses";
  const key = `${endpoint}:${subject.postal_code}`;
  try {
    let page = cache.get(key);
    if (!page || page.expires <= Date.now()) {
      const params = new URLSearchParams({ zipCodes: subject.postal_code, sortBy: "soldDate", sortAscending: "false", per_page: "500", page: "1" });
      const body = await fetchJson<{ addresses?: unknown; totalHits?: unknown }>(`${endpoint}?${params}`, { timeoutMs: 8_000, attempts: 1 });
      if (!Array.isArray(body.addresses)) return unavailable;
      page = { body: body.addresses, truncated: body.addresses.length >= 500 || (typeof body.totalHits === "number" && body.totalHits > body.addresses.length), observedAt: new Date().toISOString(), expires: Date.now() + 5 * 60_000 };
      if (cache.size >= 50) cache.delete(cache.keys().next().value!);
      cache.set(key, page);
    }
    return { transactions: mapMarketAddresses(page.body, subject, saleFrom, page.observedAt), truncated: page.truncated, status: "available" };
  } catch { return unavailable; }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComparableEntry, ComparablesResponse } from "../../../../packages/shared/src/types/api.js";
import { haversineMeters, rowToProperty } from "./row-mappers.js";
import { asIsoDate, isDanishCoordinate } from "./crawl/map-utils.js";

const CANDIDATE_LIMIT = 200;
const RESULT_LIMIT = 5;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const empty = (): ComparablesResponse => ({ comparables: [], neighborhoodAvgPricePerSqm: null });

/** Recent documented normal sales of the same property type and municipality.
 * The normalized transaction supplies both numerator and residential denominator;
 * asking prices, current areas and technical observation dates never substitute.
 * Each property contributes its latest qualifying transaction once. */
export async function getComparables(client: SupabaseClient, propertyId: string): Promise<ComparablesResponse> {
  const { data: target, error: targetError } = await client.from("properties").select("*").eq("id", propertyId).single();
  if (targetError || !target) throw targetError ?? new Error("Property not found");
  if (target.data_mode !== "real" || !target.property_type || target.property_type === "other" ||
    !isDanishCoordinate(Number(target.lat), Number(target.lon))) return empty();

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - TWELVE_MONTHS_MS).toISOString().slice(0, 10);
  const { data: candidates, error } = await client
    .from("sale_transactions")
    .select("*, property:properties!inner(*)")
    .eq("data_mode", "real")
    .eq("area_definition", "residential")
    .eq("date_precision", "day")
    .eq("property.data_mode", "real")
    .eq("property.municipality", target.municipality)
    .eq("property.property_type", target.property_type)
    .neq("property_id", propertyId)
    .gte("sold_date", cutoff)
    .lte("sold_date", today)
    .order("sold_date", { ascending: false })
    .limit(CANDIDATE_LIMIT);
  if (error) throw error;

  const usedRegistrations = new Set<string>();
  const usedSales = new Set<string>();
  const usedProperties = new Set<string>();
  const comparables: ComparableEntry[] = [];
  const ordered = [...(candidates ?? [])].sort((a, b) => String(b.sold_date).localeCompare(String(a.sold_date)));
  const signatures = new Map<string, Set<string>>();
  for (const sale of ordered) {
    const identity = `${sale.property_id}|${sale.sold_date}|${sale.date_precision}`;
    if (!signatures.has(identity)) signatures.set(identity, new Set());
    signatures.get(identity)!.add(`${sale.sale_price}|${sale.sale_type}|${sale.residential_area}`);
  }
  for (const sale of ordered) {
    if ((signatures.get(`${sale.property_id}|${sale.sold_date}|${sale.date_precision}`)?.size ?? 0) > 1) continue;
    const row = sale.property;
    const soldDate = asIsoDate(sale.sold_date);
    const price = Number(sale.sale_price);
    const residentialArea = Number(sale.residential_area);
    // Defensively check the result as well as the query: provenance and units
    // are correctness requirements, not merely search filters.
    if (!row || Array.isArray(row) || row.id === propertyId || row.id !== sale.property_id ||
      sale.data_mode !== "real" || row.data_mode !== "real" || sale.sale_type !== "normal" ||
      row.property_type !== target.property_type || row.municipality !== target.municipality ||
      sale.area_definition !== "residential" || sale.date_precision !== "day" ||
      soldDate === null || soldDate < cutoff || soldDate > today || sale.area_as_of !== soldDate ||
      !Number.isFinite(price) || price <= 0 || !Number.isFinite(residentialArea) || residentialArea <= 0 ||
      !isDanishCoordinate(Number(row.lat), Number(row.lon))) continue;

    const registrationKey = sale.registration_id ? `${sale.source}|${sale.registration_id}` : null;
    const saleKey = `${sale.property_id}|${soldDate}|${price}|normal`;
    if ((registrationKey && usedRegistrations.has(registrationKey)) || usedSales.has(saleKey) || usedProperties.has(sale.property_id)) continue;
    if (registrationKey) usedRegistrations.add(registrationKey);
    usedSales.add(saleKey);
    usedProperties.add(sale.property_id);
    comparables.push({ property: rowToProperty(row), soldDate, price,
      pricePerSqm: Math.round(price / residentialArea),
      distanceMeters: haversineMeters(Number(target.lat), Number(target.lon), Number(row.lat), Number(row.lon)),
    });
  }
  const selected = comparables.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, RESULT_LIMIT);
  return {
    comparables: selected,
    neighborhoodAvgPricePerSqm: selected.length ? Math.round(selected.reduce((sum, sale) => sum + sale.pricePerSqm, 0) / selected.length) : null,
  };
}

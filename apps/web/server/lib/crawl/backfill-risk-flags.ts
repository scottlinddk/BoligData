import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupAddressCadastral, type AddressCadastral } from "../enrichment-sources/address-lookup.js";
import { mapConcurrent } from "./concurrency.js";
import { enrichProperty, type EnrichmentPayload } from "./enrich.js";
import { withStoredIdentifiers } from "./ingest.js";
import type { RawListing } from "./types.js";

/**
 * Re-answers the due-diligence checklist for every stored property from the registers, not only the
 * ones the current feed happens to return. The crawl enriches what it sees; a listing that has left the
 * feed, or is waiting for its weekly turn, would otherwise keep its old "?" answers.
 *
 * It writes only what the registers answer, and never what it cannot see:
 * - `enrichments`: risk_flags, bbr_data, public_valuation (only when a register answered), the register
 *   keys of source_status, enriched_at. Sold-price history, calculated metrics and school data stay.
 * - `properties`: id_lokalid, matrikelnr, ejerlav, zone, bfe_nummer, only to fill a gap, never to replace.
 */
const REGISTER_KEYS = ["bbr", "valuation", "soil_type", "soil_contamination", "noise"] as const;

export interface BackfillOptions {
  write: boolean;
  limit?: number;
  concurrency?: number;
  /** Only properties whose checklist is not yet fully answered by real registers. */
  onlyStale?: boolean;
  log?: (line: string) => void;
}

export interface BackfillSummary {
  considered: number;
  updated: number;
  failed: number;
  addressResolved: number;
  noiseReal: number;
  soilReal: number;
  bbrReal: number;
  errors: string[];
}

interface PropertyRow {
  id: string;
  address: string;
  municipality: string;
  postal_code: string | null;
  price: number | string;
  sqm: number | string;
  lat: number | null;
  lon: number | null;
  building_year: number | null;
  property_type: string;
  data_mode: string | null;
  id_lokalid: string | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  zone: string | null;
  bfe_nummer: string | null;
  enrichments: Array<{ sold_price_history: unknown; source_status: Record<string, { dataMode?: string }> | null }> | null;
}

const PAGE = 200;
const ZONES = new Set(["byzone", "landzone", "sommerhusomraade"]);

export function needsBackfill(sourceStatus: Record<string, { dataMode?: string }> | null | undefined): boolean {
  return REGISTER_KEYS.some((key) => key !== "valuation" && sourceStatus?.[key]?.dataMode !== "real");
}

function toListing(row: PropertyRow): RawListing {
  return {
    data_mode: row.data_mode === "real" ? "real" : "unknown",
    address: row.address, municipality: row.municipality, postal_code: row.postal_code,
    price: Number(row.price) || 1, sqm: Number(row.sqm) || 1, listing_date: null, listing_source: "boligsiden", external_id: row.id,
    lat: Number(row.lat), lon: Number(row.lon), status: "active", building_year: row.building_year, property_type: row.property_type,
    rooms: null, images: [], description: null, agent_name: null, listing_url: null,
    sold_price_history: Array.isArray(row.enrichments?.[0]?.sold_price_history) ? row.enrichments![0]!.sold_price_history as RawListing["sold_price_history"] : [],
  };
}

export async function backfillRiskFlags(client: SupabaseClient, options: BackfillOptions): Promise<BackfillSummary> {
  const log = options.log ?? (() => undefined);
  const summary: BackfillSummary = { considered: 0, updated: 0, failed: 0, addressResolved: 0, noiseReal: 0, soilReal: 0, bbrReal: 0, errors: [] };
  const noteError = (message: string) => { summary.failed += 1; if (summary.errors.length < 25) summary.errors.push(message); };

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("properties")
      .select("id, address, municipality, postal_code, price, sqm, lat, lon, building_year, property_type, data_mode, id_lokalid, matrikelnr, ejerlav, zone, bfe_nummer, enrichments(sold_price_history, source_status)")
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`properties read: ${error.message}`);
    const rows = (data ?? []) as unknown as PropertyRow[];
    if (rows.length === 0) break;

    const todo = rows
      .filter((row) => row.lat !== null && row.lon !== null)
      .filter((row) => !options.onlyStale || needsBackfill(row.enrichments?.[0]?.source_status));
    const budget = options.limit === undefined ? todo : todo.slice(0, Math.max(0, options.limit - summary.considered));
    summary.considered += budget.length;

    await mapConcurrent(budget, options.concurrency ?? 4, async (row) => {
      try {
        const listing = toListing(row);
        // A listing without live provenance never triggers a free-text address search; its stored id is used.
        const found = listing.data_mode === "real"
          ? await lookupAddressCadastral(row.address, row.postal_code, listing.lat, listing.lon)
          : { ok: false as const, error: "non-live listing" };
        if (found.ok) summary.addressResolved += 1;
        const cadastral: AddressCadastral | null = withStoredIdentifiers(found.ok ? found.data : null, {
          idLokalid: row.id_lokalid, matrikelnr: row.matrikelnr, ejerlav: row.ejerlav,
          zone: ZONES.has(row.zone ?? "") ? row.zone as AddressCadastral["zone"] : null, bfeNummer: row.bfe_nummer,
        });
        const payload = await enrichProperty(listing, cadastral);
        if (payload.source_status.noise?.dataMode === "real") summary.noiseReal += 1;
        if (payload.source_status.soil_contamination?.dataMode === "real") summary.soilReal += 1;
        if (payload.source_status.bbr?.dataMode === "real") summary.bbrReal += 1;
        if (options.write) await persist(client, row, payload, cadastral);
        summary.updated += 1;
      } catch (err) {
        noteError(`${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    log(JSON.stringify({ event: "backfill.progress", read: from + rows.length, ...summary, errors: undefined }));
    if (rows.length < PAGE || (options.limit !== undefined && summary.considered >= options.limit)) break;
  }
  return summary;
}

async function persist(client: SupabaseClient, row: PropertyRow, payload: EnrichmentPayload, cadastral: AddressCadastral | null): Promise<void> {
  const existing = row.enrichments?.[0] ?? null;
  const mergedStatus: Record<string, unknown> = { ...(existing?.source_status ?? {}) };
  for (const key of REGISTER_KEYS) if (payload.source_status[key]) mergedStatus[key] = payload.source_status[key];

  const enrichment: Record<string, unknown> = {
    risk_flags: payload.risk_flags, bbr_data: payload.bbr_data, source_status: mergedStatus, enriched_at: payload.enriched_at,
  };
  if (payload.public_valuation) enrichment.public_valuation = payload.public_valuation;
  if (existing) {
    const { error } = await client.from("enrichments").update(enrichment).eq("property_id", row.id);
    if (error) throw new Error(`enrichments update: ${error.message}`);
  } else {
    // No row yet: write a complete one, so every required column has a value.
    const { error } = await client.from("enrichments").insert({ property_id: row.id, ...payload, source_status: mergedStatus });
    if (error) throw new Error(`enrichments insert: ${error.message}`);
  }

  const gaps: Record<string, string> = {};
  if (!row.id_lokalid && cadastral?.idLokalid) gaps.id_lokalid = cadastral.idLokalid;
  if (!row.matrikelnr && cadastral?.matrikelnr) gaps.matrikelnr = cadastral.matrikelnr;
  if (!row.ejerlav && cadastral?.ejerlav) gaps.ejerlav = cadastral.ejerlav;
  if (!row.zone && cadastral?.zone) gaps.zone = cadastral.zone;
  if (!row.bfe_nummer && cadastral?.bfeNummer) gaps.bfe_nummer = cadastral.bfeNummer;
  if (Object.keys(gaps).length > 0) {
    const { error } = await client.from("properties").update(gaps).eq("id", row.id);
    if (error) throw new Error(`properties update: ${error.message}`);
  }
}

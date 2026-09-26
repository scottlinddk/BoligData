import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { BuyingProject } from "../../../../../packages/shared/src/analysis/types.js";
import { classifyConditionEvidence } from "../../../../../packages/shared/src/analysis/condition.js";
import type { ResearchHistoryResponse } from "../../../../../packages/shared/src/types/research-api.js";
import { isUuid, sendError } from "../http-helpers.js";
import { getServiceRoleClient } from "../supabase.js";
import { object, ResearchValidationError, validateAssessment, validateProject } from "./validation.js";
import { importIdentity, parseCsv, previewImport, validateImportRequest } from "./import.js";

type Row = Record<string, any>;
const queryString = (v: unknown): string | undefined => Array.isArray(v) ? v[0] : typeof v === "string" ? v : undefined;
const numberOrNull = (v: unknown): number | null => v === null || v === undefined ? null : Number(v);
const camelRow = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([key]) => !["owner_id", "ingest_key"].includes(key)).map(([key, value]) => [key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase()), value]));

export function projectToRow(project: BuyingProject, ownerId: string): Row {
  return { owner_id: ownerId, name: project.name, total_budget: project.totalBudget, min_residential_area: project.minResidentialArea,
    min_bedrooms: project.minBedrooms, accepted_property_types: project.acceptedPropertyTypes, primary_areas: project.primaryAreas,
    secondary_areas: project.secondaryAreas, excluded_addresses: project.excludedAddresses, excluded_roads: project.excludedRoads,
    excluded_areas: project.excludedAreas, preferences: project.preferences, purchase_tracks: project.tracks, updated_at: new Date().toISOString() };
}
export function projectFromRow(row: Row): BuyingProject {
  return { name: row.name, totalBudget: Number(row.total_budget), minResidentialArea: Number(row.min_residential_area), minBedrooms: row.min_bedrooms,
    acceptedPropertyTypes: row.accepted_property_types, primaryAreas: row.primary_areas, secondaryAreas: row.secondary_areas,
    excludedAddresses: row.excluded_addresses, excludedRoads: row.excluded_roads, excludedAreas: row.excluded_areas,
    preferences: row.preferences, tracks: row.purchase_tracks };
}
function checkMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
  if (methods.includes(req.method ?? "")) return true;
  res.setHeader("Allow", methods.join(", ")); res.status(405).json({ error: "Method not allowed" }); return false;
}
function propertyIdFromQuery(req: VercelRequest, optional = false): string | undefined {
  const id = queryString(req.query.propertyId);
  if (optional && !id) return undefined;
  if (!isUuid(id)) throw new ResearchValidationError("Et gyldigt bolig-id er påkrævet.");
  return id;
}
export async function handleResearch(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string, resource: string): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    switch (resource) {
      case "research-project": return await handleProject(req, res, client, userId);
      case "research-find": return await handleFind(req, res, client);
      case "research-assessment": return await handleAssessment(req, res, client, userId);
      case "research-assessments": return await handleAssessments(req, res, client, userId);
      case "research-history": return await handleHistory(req, res, client);
      case "research-import-preview": return await handleImportPreview(req, res, client, userId);
      case "research-import-commit": return await handleImportCommit(req, res, client);
      default: res.status(404).json({ error: "Not found" });
    }
  } catch (error) {
    if (error instanceof ResearchValidationError) sendError(res, 400, error.message);
    else sendError(res, 500, "Boligundersøgelsen kunne ikke indlæses eller gemmes. Kontroller at research-migrationen er installeret.", error);
  }
}
async function handleFind(req: VercelRequest, res: VercelResponse, client: SupabaseClient) {
  if (!checkMethod(req, res, ["GET"])) return;
  const query = queryString(req.query.query)?.trim();
  if (!query || query.length < 2 || query.length > 500) throw new ResearchValidationError("Indtast en adresse eller et annoncelink (2–500 tegn).");
  let search = client.from("properties").select("id,address");
  if (/^https?:\/\//i.test(query)) {
    let url: URL;
    try { url = new URL(query); } catch { throw new ResearchValidationError("Annoncelinket er ugyldigt."); }
    // Lookup only: never fetch a user-supplied URL server-side.
    url.hash = "";
    search = search.eq("listing_url", url.href);
  } else {
    search = search.ilike("address", `%${query.replace(/[%_\\]/g, "")}%`);
  }
  const { data, error } = await search.order("address").limit(12);
  if (error) throw error;
  res.status(200).json({ properties: data ?? [] });
}
async function handleProject(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string) {
  if (!checkMethod(req, res, ["GET", "PUT"])) return;
  if (req.method === "PUT") {
    const project = validateProject(object(req.body, "Request").project);
    const { error } = await client.from("buying_projects").upsert(projectToRow(project, userId), { onConflict: "owner_id" });
    if (error) throw error;
  }
  const { data, error } = await client.from("buying_projects").select("*").eq("owner_id", userId).maybeSingle();
  if (error) throw error;
  res.status(200).json({ project: data ? projectFromRow(data) : null, updatedAt: data?.updated_at ?? null });
}
async function handleAssessment(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string) {
  if (!checkMethod(req, res, ["GET", "PUT"])) return;
  const propertyId = propertyIdFromQuery(req)!;
  if (req.method === "PUT") {
    const assessment = validateAssessment(object(req.body, "Request").assessment, propertyId);
    const { data: property, error: propertyError } = await client.from("properties").select("id").eq("id", propertyId).maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) { sendError(res, 404, "Boligen findes ikke."); return; }
    const { error } = await client.from("property_assessments").upsert({ owner_id: userId, property_id: propertyId, assessment }, { onConflict: "owner_id,property_id" });
    if (error) throw error;
  }
  const [current, revisions] = await Promise.all([
    client.from("property_assessments").select("*").eq("owner_id", userId).eq("property_id", propertyId).maybeSingle(),
    client.from("assessment_revisions").select("*").eq("owner_id", userId).eq("property_id", propertyId).order("revision", { ascending: false }).limit(50),
  ]);
  if (current.error || revisions.error) throw current.error ?? revisions.error;
  res.status(200).json({ assessment: current.data?.assessment ?? null, revision: current.data?.revision ?? null, updatedAt: current.data?.updated_at ?? null,
    revisions: (revisions.data ?? []).map((r) => ({ id: r.id, revision: r.revision, assessment: r.assessment, projectSnapshot: r.project_snapshot ? projectFromRow(r.project_snapshot) : null, propertySnapshot: r.property_snapshot ?? null, createdAt: r.created_at })) });
}
async function handleAssessments(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string) {
  if (!checkMethod(req, res, ["GET"])) return;
  const { data, error } = await client.from("property_assessments").select("assessment,revision,updated_at,properties(id,address,price,sqm,property_type)")
    .eq("owner_id", userId).order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  res.status(200).json({ assessments: (data ?? []).map((r: Row) => ({ assessment: r.assessment, revision: r.revision, updatedAt: r.updated_at,
    property: r.properties ? { ...camelRow(r.properties), price: Number(r.properties.price), sqm: Number(r.properties.sqm) } : null })) });
}

/** Exported for tests: unknown legacy provenance never becomes a real reference. */
export function transactionFromRow(row: Row, evidenceRows: Row[] = []): ResearchHistoryResponse["transactions"][number] {
  const property = row.properties ?? {};
  const evidence = evidenceRows.find((r) => r.transaction_id === row.id && r.data_mode === "real");
  // Price and transfer type are observations: disagreement on the same explicit
  // property/unit and date must become a conflict, not an independent trade.
  // Imprecise dates remain excluded by the statistics engine.
  return { id: row.id, transactionIdentity: `${row.property_id}:${row.sold_date}:${row.date_precision}`,
    propertyId: row.property_id, unitId: null, address: property.address ?? "Ukendt adresse", municipality: property.municipality ?? null,
    postalCode: property.postal_code ?? null, propertyType: property.property_type ?? "other", lat: numberOrNull(property.lat), lon: numberOrNull(property.lon), saleType: row.sale_type === "unknown" ? null : row.sale_type,
    saleDate: row.date_precision === "day" ? row.sold_date : row.date_precision === "month" ? row.sold_date?.slice(0, 7) ?? null : null,
    datePrecision: row.date_precision, saleDateEnd: row.sold_date_end, observedAt: row.observed_at, firstAsking: numberOrNull(row.first_asking_price),
    lastAsking: numberOrNull(row.last_asking_price), soldPrice: numberOrNull(row.sale_price), residentialArea: numberOrNull(row.residential_area),
    areaDefinition: row.area_definition, areaAtSale: !!row.area_as_of && row.area_as_of === row.sold_date && row.date_precision === "day",
    areaEvidence: row.residential_area == null ? "unknown" : "reported", activeDays: row.documented_active_days ?? null,
    latestEpisodeDays: row.latest_episode_days ?? null, calendarDays: row.calendar_days ?? null,
    condition: evidence ? classifyConditionEvidence({ text: evidence.excerpt, source: evidence.source, listingEpisodeId: evidence.episode_id,
      observedAt: evidence.observed_at, validAt: evidence.effective_date, saleDate: row.date_precision === "day" ? row.sold_date : null, humanApproved: evidence.human_approved }) : null,
    dataMode: row.data_mode === "real" ? "live" : row.data_mode === "demo" || row.data_mode === "mock" ? "mock" : "unavailable",
    status: "sold", source: row.source, sourceUrl: row.source_url ?? null };
}
async function handleHistory(req: VercelRequest, res: VercelResponse, client: SupabaseClient) {
  if (!checkMethod(req, res, ["GET"])) return;
  const propertyId = propertyIdFromQuery(req, true);
  const tables = ["listing_campaigns", "listing_episodes", "listing_events", "sale_transactions", "source_observations", "condition_evidence"];
  const results = await Promise.all(tables.map((table) => {
    let query = client.from(table).select(table === "sale_transactions" ? "*,properties(address,municipality,postal_code,property_type,lat,lon)" : "*");
    if (propertyId) query = query.eq("property_id", propertyId);
    return query.order("observed_at", { ascending: false }).order("id", { ascending: true }).limit(500);
  }));
  for (const result of results) if (result.error) throw result.error;
  const rows = results.map((r) => (r.data ?? []) as Row[]);
  const [campaigns = [], episodes = [], events = [], transactions = [], observations = [], conditionEvidence = []] = rows;
  const dataVersion = `research/1:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 24)}`;
  const result: ResearchHistoryResponse = {
    campaigns: campaigns.map(camelRow) as ResearchHistoryResponse["campaigns"], episodes: episodes.map(camelRow) as ResearchHistoryResponse["episodes"],
    events: events.map((r) => ({ ...camelRow(r), price: numberOrNull(r.price) })) as ResearchHistoryResponse["events"],
    transactions: transactions.map((r) => transactionFromRow(r, conditionEvidence)),
    observations: observations.map(camelRow) as ResearchHistoryResponse["observations"], conditionEvidence: conditionEvidence.map(camelRow) as ResearchHistoryResponse["conditionEvidence"],
    dataVersion, retrievedAt: new Date().toISOString(), truncated: rows.some((r) => r.length >= 500),
  };
  res.status(200).json(result);
}
async function handleImportPreview(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string) {
  if (!checkMethod(req, res, ["POST"])) return;
  const request = validateImportRequest(req.body);
  const delimiter = request.delimiter ?? (request.csv.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",");
  const rawRows = parseCsv(request.csv, delimiter);
  const columns = rawRows[0]?.map((x) => x.trim()) ?? [];
  const idColumn = columns.indexOf(request.mapping.propertyId!);
  const propertyIds = [...new Set(rawRows.slice(1).map((r) => r[idColumn]?.trim().toLowerCase()).filter(isUuid))];
  const knownPropertyIds = new Set<string>(); const existingIdentities = new Set<string>();
  // Bound IN lists and retrieve all matching transactions, rather than silently
  // relying on PostgREST's default 1000-row ceiling for duplicate checks.
  for (let i = 0; i < propertyIds.length; i += 100) {
    const ids = propertyIds.slice(i, i + 100);
    const props = await client.from("properties").select("id").in("id", ids);
    if (props.error) throw props.error;
    for (const p of props.data ?? []) knownPropertyIds.add(p.id);
    let from = 0;
    while (true) {
      const sales = await client.from("sale_transactions").select("property_id,sold_date,date_precision,sale_price,sale_type").in("property_id", ids).order("id").range(from, from + 499);
      if (sales.error) throw sales.error;
      for (const r of sales.data ?? []) existingIdentities.add(importIdentity({ propertyId: r.property_id, soldDate: r.sold_date, datePrecision: r.date_precision, salePrice: Number(r.sale_price), saleType: r.sale_type }));
      if ((sales.data?.length ?? 0) < 500) break;
      from += 500;
    }
  }
  const preview = previewImport(request, knownPropertyIds, existingIdentities);
  // Staging is intentionally server-only. The authenticated caller can read
  // their preview, but cannot bypass validation through Supabase REST writes.
  const service = getServiceRoleClient();
  const { data: batch, error: batchError } = await service.from("research_import_batches").insert({ owner_id: userId,
    source_file: request.fileName, source_sheet: request.sheetName, source_version: request.sourceVersion,
    collected_at: request.collectedAt, data_mode: request.dataMode ?? "unknown", mapping: request.mapping }).select("id").single();
  if (batchError || !batch) throw batchError ?? new Error("Missing import batch");
  if (preview.rows.length) {
    const { error } = await service.from("research_import_rows").insert(preview.rows.map((row) => ({ batch_id: batch.id, owner_id: userId,
      row_number: row.rowNumber, status: row.status, reasons: row.reasons, raw_values: row.values, normalized: row.normalized })));
    if (error) { await service.from("research_import_batches").delete().eq("id", batch.id).eq("owner_id", userId); throw error; }
  }
  res.status(200).json({ ...preview, batchId: batch.id });
}
async function handleImportCommit(req: VercelRequest, res: VercelResponse, client: SupabaseClient) {
  if (!checkMethod(req, res, ["POST"])) return;
  const batchId = object(req.body, "Request").batchId;
  if (!isUuid(batchId)) throw new ResearchValidationError("Et gyldigt import-id er påkrævet.");
  const { data, error } = await client.rpc("commit_research_import", { p_batch_id: batchId });
  if (error) throw error;
  res.status(200).json(data);
}

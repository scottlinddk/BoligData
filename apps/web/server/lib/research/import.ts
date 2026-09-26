import type { ResearchImportField, ResearchImportPreviewResponse, ResearchImportPreviewRow, ResearchImportRequest } from "../../../../../packages/shared/src/types/research-api.js";
import { isUuid } from "../http-helpers.js";
import { object, ResearchValidationError } from "./validation.js";

export const IMPORT_FIELDS: ResearchImportField[] = ["propertyId", "soldDate", "salePrice", "saleType", "firstAskingPrice", "lastAskingPrice", "residentialArea", "areaDefinition", "areaAsOf", "latestEpisodeDays", "documentedActiveDays", "calendarDays", "sourceUrl", "conditionText", "conditionAsOf"];
export const MAX_IMPORT_ROWS = 2000;
export interface NormalizedImport {
  propertyId: string; soldDate: string; soldDateEnd: string | null; datePrecision: "day" | "month";
  salePrice: number; saleType: "normal" | "family" | "auction" | "other" | "unknown";
  firstAskingPrice: number | null; lastAskingPrice: number | null; residentialArea: number | null;
  areaDefinition: "residential" | "weighted" | "unknown"; areaAsOf: string | null;
  latestEpisodeDays: number | null; documentedActiveDays: number | null; calendarDays: number | null;
  sourceUrl: string | null; conditionText: string | null; conditionAsOf: string | null;
}
export function parseCsv(input: string, delimiter: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += ch;
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; closed = false; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell); rows.push(row);
      row = []; cell = ""; closed = false;
      if (rows.length > MAX_IMPORT_ROWS + 1) throw new ResearchValidationError(`Højst ${MAX_IMPORT_ROWS} datarækker pr. import.`);
    } else {
      if (closed && ch.trim()) throw new ResearchValidationError("Ugyldig CSV: tegn efter afsluttende anførselstegn.");
      if (ch === '"') throw new ResearchValidationError("Ugyldig CSV: uventet anførselstegn.");
      if (!closed) cell += ch;
    }
  }
  if (quoted) throw new ResearchValidationError("Ugyldig CSV: et citeret felt er ikke afsluttet.");
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > MAX_IMPORT_ROWS + 1) throw new ResearchValidationError(`Højst ${MAX_IMPORT_ROWS} datarækker pr. import.`);
  return rows;
}
function cleanText(value: unknown, name: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ResearchValidationError(`${name} mangler eller er for langt.`);
  return value.trim();
}
export function validateImportRequest(value: unknown, now = new Date()): ResearchImportRequest {
  const v = object(value, "Import");
  if (typeof v.csv !== "string" || !v.csv.trim() || v.csv.length > 2_000_000) throw new ResearchValidationError("Indsæt en CSV-fil på højst 2 MB.");
  const rawMapping = object(v.mapping, "Kolonnemapping"); const mapping: ResearchImportRequest["mapping"] = {};
  for (const [key, val] of Object.entries(rawMapping)) {
    if (!IMPORT_FIELDS.includes(key as ResearchImportField)) throw new ResearchValidationError(`Ukendt importfelt: ${key}. Tidligere vurderinger og rangeringer importeres ikke.`);
    mapping[key as ResearchImportField] = cleanText(val, key);
  }
  for (const key of ["propertyId", "soldDate", "salePrice"] as const) if (!mapping[key]) throw new ResearchValidationError(`Kolonnemapping for ${key} er påkrævet.`);
  const collectedAt = cleanText(v.collectedAt, "Indsamlingstidspunkt", 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(collectedAt) || !Number.isFinite(Date.parse(collectedAt)) || Date.parse(collectedAt) > now.getTime() + 60_000) throw new ResearchValidationError("Indsamlingstidspunkt skal være et gyldigt ISO-tidspunkt, som ikke ligger i fremtiden.");
  if (v.delimiter !== undefined && ![",", ";", "\t"].includes(String(v.delimiter))) throw new ResearchValidationError("CSV-separator skal være komma, semikolon eller tabulator.");
  if (v.dataMode !== undefined && !["real", "mock", "demo", "unknown"].includes(String(v.dataMode))) throw new ResearchValidationError("Datatilstand skal være real, mock, demo eller unknown.");
  return { csv: v.csv.replace(/^\uFEFF/, ""), mapping, collectedAt, fileName: cleanText(v.fileName, "Kildefil"), sheetName: cleanText(v.sheetName, "Fanenavn"), sourceVersion: cleanText(v.sourceVersion, "Kildeversion"), delimiter: v.delimiter as ResearchImportRequest["delimiter"], dataMode: v.dataMode as ResearchImportRequest["dataMode"] ?? "unknown" };
}
export function parseImportDate(value: string): { start: string; end: string | null; precision: "day" | "month" } | null {
  let v = value.trim();
  const local = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (local) v = `${local[3]}-${local[2]!.padStart(2, "0")}-${local[1]!.padStart(2, "0")}`;
  if (/^\d{4}-\d{2}$/.test(v)) {
    const year = Number(v.slice(0, 4)), month = Number(v.slice(5));
    if (year < 1800 || month < 1 || month > 12) return null;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${v}-01`, end, precision: "month" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v || Number(v.slice(0, 4)) < 1800) return null;
  return { start: v, end: null, precision: "day" };
}
function number(value: string): number | null {
  if (!value.trim()) return null;
  let v = value.trim().replace(/\s/g, "").replace(/(?:kr\.?|dkk)$/i, "");
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v)) v = v.replace(/\./g, "");
  v = v.replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(v)) return NaN;
  return Number(v);
}
export function importIdentity(row: Pick<NormalizedImport, "propertyId" | "soldDate" | "salePrice" | "saleType"> & { datePrecision?: string }): string {
  return `${row.propertyId.toLowerCase()}|${row.soldDate}|${row.datePrecision ?? "day"}|${row.salePrice}|${row.saleType}`;
}
export function previewImport(request: ResearchImportRequest, knownPropertyIds: Set<string>, existingIdentities = new Set<string>()): Omit<ResearchImportPreviewResponse, "batchId"> {
  const delimiter = request.delimiter ?? (request.csv.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",");
  const parsed = parseCsv(request.csv, delimiter); const columns = parsed.shift()?.map((x) => x.trim()) ?? [];
  if (!columns.length || columns.some((x) => !x) || new Set(columns).size !== columns.length) throw new ResearchValidationError("Kolonneoverskrifter skal være udfyldte og entydige.");
  for (const column of Object.values(request.mapping)) if (!columns.includes(column)) throw new ResearchValidationError(`Kolonnen '${column}' findes ikke i filen.`);
  const seen = new Set(existingIdentities);
  const rows: ResearchImportPreviewRow[] = parsed.map((cells, index) => ({ cells, index })).filter(({ cells }) => cells.some((v) => v.trim())).map(({ cells, index }) => {
    const values = Object.fromEntries(columns.map((c, i) => [c, cells[i]?.trim() ?? ""]));
    const get = (key: ResearchImportField) => values[request.mapping[key] ?? ""] ?? "";
    const reasons: string[] = []; let quarantine = false;
    if (cells.length !== columns.length) reasons.push("Antal felter stemmer ikke med kolonneoverskrifterne.");
    const propertyId = get("propertyId").toLowerCase();
    if (!isUuid(propertyId) || !knownPropertyIds.has(propertyId)) { reasons.push("Boligenheden skal kobles med et eksisterende, eksplicit bolig-id; adresse alene er ikke tilstrækkelig."); quarantine = true; }
    const sold = parseImportDate(get("soldDate"));
    if (!sold) reasons.push("Handelsdato er ugyldig. Brug ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM med bevaret månedspræcision.");
    else if (sold.start > request.collectedAt.slice(0, 10)) { reasons.push("Handelsdato ligger efter indsamlingen og kræver kontrol."); quarantine = true; }
    const salePrice = number(get("salePrice"));
    if (salePrice === null || !Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 1_000_000_000) reasons.push("Salgspris skal være et positivt beløb.");
    const saleType = get("saleType") || "unknown";
    if (!["normal", "family", "auction", "other", "unknown"].includes(saleType)) reasons.push("Handelstype skal være normal, family, auction, other eller unknown.");
    const areaDefinition = get("areaDefinition") || "unknown";
    if (!["residential", "weighted", "unknown"].includes(areaDefinition)) reasons.push("Arealdefinition skal være residential, weighted eller unknown.");
    const numbers: Record<string, number | null> = {};
    for (const key of ["firstAskingPrice", "lastAskingPrice", "residentialArea", "latestEpisodeDays", "documentedActiveDays", "calendarDays"] as const) {
      const val = number(get(key)); numbers[key] = val;
      if (val !== null && (!Number.isFinite(val) || val < 0 || val > 1_000_000_000 || (!key.endsWith("Days") && val === 0) || (key.endsWith("Days") && !Number.isInteger(val)))) reasons.push(`Ugyldigt tal i ${key}; et tomt felt betyder ukendt.`);
    }
    const sourceUrl = get("sourceUrl") || null;
    if (sourceUrl) { try { if (!["http:", "https:"].includes(new URL(sourceUrl).protocol)) reasons.push("Kildelink skal være http eller https."); } catch { reasons.push("Kildelink er ugyldigt."); } }
    const areaAsOf = get("areaAsOf") ? parseImportDate(get("areaAsOf")) : null;
    const conditionAsOf = get("conditionAsOf") ? parseImportDate(get("conditionAsOf")) : null;
    if (get("areaAsOf") && (!areaAsOf || areaAsOf.precision !== "day")) reasons.push("Arealets gyldighedsdato skal være en præcis, dokumenteret dato.");
    if (get("conditionAsOf") && (!conditionAsOf || conditionAsOf.precision !== "day")) reasons.push("Standstekstens gyldighedsdato skal være en præcis, dokumenteret dato.");
    if (get("conditionText").length > 20_000) reasons.push("Standstekst må højst være 20.000 tegn.");
    const normalized = reasons.length ? null : { propertyId, soldDate: sold!.start, soldDateEnd: sold!.end, datePrecision: sold!.precision,
      salePrice: salePrice!, saleType, ...numbers, areaDefinition, areaAsOf: areaAsOf?.start ?? null, sourceUrl,
      conditionText: get("conditionText") || null, conditionAsOf: conditionAsOf?.start ?? null } as unknown as NormalizedImport;
    let status: ResearchImportPreviewRow["status"] = quarantine ? "quarantined" : reasons.length ? "rejected" : "accepted";
    if (normalized) { const key = importIdentity(normalized); if (seen.has(key)) { status = "duplicate"; reasons.push("Samme bolig, handelsdato, pris og handelstype findes allerede."); } else seen.add(key); }
    return { rowNumber: index + 2, status, reasons, values, normalized: normalized as unknown as Record<string, unknown> | null };
  });
  const accepted = rows.filter((r) => r.status === "accepted"); const pairs = accepted.filter((r) => r.normalized?.firstAskingPrice != null);
  const withDays = pairs.filter((r) => r.normalized?.documentedActiveDays != null); const groups = [0, 0, 0, 0, 0];
  for (const row of withDays) { const days = row.normalized!.documentedActiveDays as number; const index = days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : days <= 365 ? 3 : 4; groups[index]!++; }
  return { columns, mapping: request.mapping, rows, counts: { total: rows.length, accepted: accepted.length, rejected: rows.filter((r) => r.status === "rejected").length, duplicate: rows.filter((r) => r.status === "duplicate").length, quarantined: rows.filter((r) => r.status === "quarantined").length },
    reconciliation: { historicalControl: { rows: 437, pricePairs: 317, pairsWithDays: 281, groups: [79, 77, 65, 44, 16] }, actual: { rows: accepted.length, pricePairs: pairs.length, pairsWithDays: withDays.length, groups }, note: "Historiske kontroltal vedrører et ældre udvalg. Afvigelser vises; importen tvinges ikke til at matche. Grupperne her bruger dokumenteret aktiv liggetid og må kun sammenholdes med samme historiske definition." } };
}

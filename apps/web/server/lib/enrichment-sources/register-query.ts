import { asNonEmptyString } from "../shared/map-utils.js";
import { postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { sourceFailed, sourceOk, type SourceResult } from "./types.js";

/**
 * Small helpers shared by the sources that walk Datafordeler's entity
 * connections by hand (VUR valuations, BBR tanks): reading a node list
 * defensively, register codes and ids, and one `query` that builds the
 * connection document. Pure parsing plus one POST; nothing here knows a register.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function asNodes(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.flatMap((node) => (asRecord(node) ? [asRecord(node)!] : [])) : [];
}

export const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Codes and numbers come back as either strings or numbers depending on the field. */
export function asCode(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asNonEmptyString(value);
}

/** Register row ids run to about 9e14, past `positiveInt`'s cap for amounts and years. Exact integers only. */
export function registerId(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function positiveInt(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 && rounded <= 1e12 ? rounded : null;
}

/** ISO timestamp for a parseable date between 1990 and now, else null (a future date is never "known"). */
export function isoTimestamp(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms < Date.UTC(1990, 0, 1) || ms > now) return null;
  return new Date(ms).toISOString();
}

export interface QueryOptions {
  /** BBR needs registreringstid/virkningstid, VUR rejects them. Both facts are in the published schemas. */
  temporal?: boolean;
  first?: number;
  pageInfo?: boolean;
}

export interface Connection {
  nodes: Record<string, unknown>[];
  hasNextPage: boolean | null;
}

export async function query(
  service: DatafordelerService,
  apiKey: string,
  entity: string,
  where: string,
  selection: string,
  { temporal = false, first, pageInfo = false }: QueryOptions = {},
): Promise<Connection> {
  const tid = JSON.stringify(new Date().toISOString());
  const args = [temporal && `registreringstid: ${tid} virkningstid: ${tid}`, first !== undefined && `first: ${first}`, `where: { ${where} }`]
    .filter(Boolean)
    .join(" ");
  const document = `query Q { ${entity}(${args}) { ${pageInfo ? "pageInfo { hasNextPage } " : ""}nodes { ${selection} } } }`;
  const data = await postGraphQl<Record<string, unknown>>(service, apiKey, document);
  const connection = asRecord(data?.[entity]);
  const hasNextPage = asRecord(connection?.pageInfo)?.hasNextPage;
  return { nodes: asNodes(connection?.nodes), hasNextPage: typeof hasNextPage === "boolean" ? hasNextPage : null };
}

export function apiKeyOrFailure(): SourceResult<string> {
  const apiKey = process.env.DATAFORDELER_API_KEY;
  return apiKey ? sourceOk(apiKey) : sourceFailed("DATAFORDELER_API_KEY not configured");
}


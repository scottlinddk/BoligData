/**
 * Address autocomplete against Klimadatastyrelsen's Adressevælger, the
 * replacement for DAWA Autocomplete (DAWA closed 2026-10-01).
 *
 * Called straight from the browser: the API is open (`access-control-allow-origin: *`),
 * takes a plain GET with no custom headers (so no CORS preflight), and holds no
 * secret. Its `token` only has to be 10+ arbitrary characters, and KDS publishes
 * the value below for everyone to use until real accounts are introduced.
 * Routing keystrokes through our own function would add latency and spend one of
 * the 12 serverless functions the Hobby plan allows for no gain.
 */
const BASE_URL = "https://adressevaelger.dk";
const TOKEN = "adressevaelger123";

export const MIN_QUERY_LENGTH = 2;
/** Adressevælger rejects free text longer than this. */
export const MAX_QUERY_LENGTH = 73;
const MAX_SUGGESTIONS = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AddressSuggestion {
  /** `address` is a complete house number that can be looked up; `refine` is a street (or street + postcode) to keep typing from. */
  kind: "address" | "refine";
  label: string;
  /** DAR husnummer UUID. Present only for `address`. */
  id: string | null;
}

export function isHusnummerId(value: string): boolean {
  return UUID.test(value);
}

export function normalizeQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export function buildSearchUrl(text: string): string {
  const params = new URLSearchParams({ tekst: normalizeQuery(text), maksimum: String(MAX_SUGGESTIONS), token: TOKEN });
  return `${BASE_URL}/husnumre/soeg?${params}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Only `husnummer` hits with a real id are final answers. A street or
 * street+postcode hit (the search is "not specific enough") becomes a `refine`
 * suggestion, so selecting it keeps the user typing instead of looking up
 * something that is not an address.
 */
export function parseSuggestions(body: unknown): AddressSuggestion[] {
  const hits = asRecord(body)?.fund;
  if (!Array.isArray(hits)) return [];

  const seen = new Set<string>();
  const suggestions: AddressSuggestion[] = [];
  for (const hit of hits) {
    const record = asRecord(hit);
    const label = typeof record?.titel === "string" ? record.titel.trim() : "";
    if (!record || !label) continue;

    const id = typeof record.id === "string" ? record.id : "";
    const isAddress = record.type === "husnummer" && isHusnummerId(id);
    const key = isAddress ? `a:${id}` : `r:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(isAddress ? { kind: "address", label, id } : { kind: "refine", label, id: null });
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
}

export async function searchAddresses(text: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  if (normalizeQuery(text).length < MIN_QUERY_LENGTH) return [];
  const res = await fetch(buildSearchUrl(text), { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  return parseSuggestions(await res.json());
}

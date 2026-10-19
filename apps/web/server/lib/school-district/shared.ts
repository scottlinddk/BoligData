import type { SchoolDistrictResult } from "../../../../../packages/shared/src/types/school-district.js";
import { parseStructuredAddress } from "../enrichment-sources/address-lookup-dar-fallback.js";

export const REQUEST_OPTIONS = { timeoutMs: 5_000, attempts: 1 };

export interface SchoolAddress {
  streetName: string;
  houseNumber: string;
  postalCode: string | null;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function text(value: unknown, limit = 300): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit ? value.trim() : null;
}

export const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("da-DK").replace(/\s+/g, " ").trim();

/** A house/street number in the first segment must never become a postcode. */
export function embeddedPostcode(address: string): string | null {
  const segments = address.split(",");
  if (segments.length < 2) return null;
  return /^\s*(\d{4})(?:\s+\p{L}.*)?\s*$/u.exec(segments.at(-1)!)?.[1] ?? null;
}

export function parseSchoolAddress(address: string, postalCodeHint: string | null): SchoolAddress | null {
  const structured = parseStructuredAddress(address, postalCodeHint);
  return structured ? { ...structured, postalCode: postalCodeHint ?? embeddedPostcode(address) } : null;
}

export function sameAddressParts(expected: SchoolAddress, actual: SchoolAddress): boolean {
  return actual.postalCode === expected.postalCode &&
    normalize(actual.streetName) === normalize(expected.streetName) &&
    normalize(actual.houseNumber) === normalize(expected.houseNumber);
}

export function sameAddress(expected: SchoolAddress, address: string): boolean {
  const actual = parseSchoolAddress(address, null);
  return actual !== null && sameAddressParts(expected, actual);
}

export function emptyResult(sourceUrl: string): SchoolDistrictResult {
  return {
    status: "unavailable", reason: null, addressId: null, address: null, municipality: null,
    matches: [], confidence: "unknown", provider: null, source: null, sourceUrl,
    checkedAt: new Date().toISOString(), disclaimer: null,
  };
}

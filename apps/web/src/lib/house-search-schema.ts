import { HOUSE_SEARCH_STATUSES, type HouseSearchEntryInput, type HouseSearchStatus } from "@shared/types/house-search";
import { isHusnummerId } from "@/lib/address-search";
import type { ResolvedAddress } from "@/lib/house-search-geocode";

/** Below this is a typo (3.5 meant as millions), not a house price. */
export const MIN_PRICE_DKK = 10_000;
export const MAX_PRICE_DKK = 200_000_000;
export const MAX_ROOMS = 30;
export const MAX_NOTES_LENGTH = 2000;

/** Raw values as typed in the form. */
export interface EntryFormValues {
  husnummerId: string;
  addressLabel: string;
  seenAt: string;
  price: string;
  rooms: string;
  status: string;
  rating: string;
  notes: string;
}

export type EntryField = "address" | "seenAt" | "price" | "rooms" | "status" | "rating" | "notes";
/** Stable codes the UI maps to translated messages. */
export type EntryErrorCode = "required" | "invalidDate" | "invalidNumber" | "outOfRange" | "tooLong";
export type EntryErrors = Partial<Record<EntryField, EntryErrorCode>>;

export type ParsedEntry =
  | { ok: true; input: Omit<HouseSearchEntryInput, "lat" | "lon" | "postalCode"> }
  | { ok: false; errors: EntryErrors };

export const EMPTY_FORM: EntryFormValues = {
  husnummerId: "",
  addressLabel: "",
  seenAt: "",
  price: "",
  rooms: "",
  status: "interested",
  rating: "",
  notes: "",
};

/** Local calendar date as YYYY-MM-DD. `toISOString` would shift the day around midnight in Denmark. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * "3.495.000", "3 495 000" and "3495000 kr." all mean 3,495,000.
 * A separator is only accepted as a thousands separator (groups of exactly three digits), so "3.5"
 * or "3,5 mio" are rejected instead of being silently read as 35 or 3.
 */
export function parseDanishInteger(text: string): number | null {
  const cleaned = text.replace(/\s*kr\.?$/i, "").trim();
  if (/^\d{1,12}$/.test(cleaned)) return Number(cleaned);
  if (/^\d{1,3}([.  ]\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/[.  ]/g, ""));
  return null;
}

function isStatus(value: string): value is HouseSearchStatus {
  return (HOUSE_SEARCH_STATUSES as readonly string[]).includes(value);
}

export function parseEntryForm(values: EntryFormValues): ParsedEntry {
  const errors: EntryErrors = {};

  const husnummerId = values.husnummerId.trim();
  if (!isHusnummerId(husnummerId) || !values.addressLabel.trim()) errors.address = "required";

  const seenAt = values.seenAt.trim();
  if (!seenAt) errors.seenAt = "required";
  else if (!isRealIsoDate(seenAt)) errors.seenAt = "invalidDate";

  let askingPriceDkk: number | null = null;
  if (values.price.trim()) {
    const parsed = parseDanishInteger(values.price.trim());
    if (parsed === null) errors.price = "invalidNumber";
    else if (parsed < MIN_PRICE_DKK || parsed > MAX_PRICE_DKK) errors.price = "outOfRange";
    else askingPriceDkk = parsed;
  }

  let rooms: number | null = null;
  if (values.rooms.trim()) {
    const parsed = /^\d{1,3}$/.test(values.rooms.trim()) ? Number(values.rooms.trim()) : null;
    if (parsed === null) errors.rooms = "invalidNumber";
    else if (parsed < 1 || parsed > MAX_ROOMS) errors.rooms = "outOfRange";
    else rooms = parsed;
  }

  let rating: number | null = null;
  if (values.rating.trim()) {
    const parsed = /^[1-5]$/.test(values.rating.trim()) ? Number(values.rating.trim()) : null;
    if (parsed === null) errors.rating = "outOfRange";
    else rating = parsed;
  }

  if (!isStatus(values.status)) errors.status = "required";
  if (values.notes.length > MAX_NOTES_LENGTH) errors.notes = "tooLong";

  if (Object.keys(errors).length > 0 || !isStatus(values.status)) return { ok: false, errors };
  return {
    ok: true,
    input: {
      husnummerId,
      addressLabel: values.addressLabel.trim(),
      seenAt,
      askingPriceDkk,
      rooms,
      status: values.status,
      rating,
      notes: values.notes.trim(),
    },
  };
}

/** Joins the parsed form with the looked-up location into what the database row needs. */
export function withLocation(
  parsed: Omit<HouseSearchEntryInput, "lat" | "lon" | "postalCode">,
  resolved: ResolvedAddress,
): HouseSearchEntryInput {
  return { ...parsed, lat: resolved.lat, lon: resolved.lon, postalCode: resolved.postalCode };
}

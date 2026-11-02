import type { Household, HouseSearchEntry, HouseSearchEntryInput, HouseSearchStatus } from "@shared/types/house-search";

/** Database row shapes (snake_case). Kept separate from the API calls so they can be tested without a Supabase client. */
export interface EntryRow {
  id: string;
  household_id: string;
  created_by: string;
  husnummer_id: string;
  address_label: string;
  postal_code: string | null;
  lat: number | null;
  lon: number | null;
  seen_at: string;
  asking_price_dkk: number | null;
  rooms: number | null;
  status: HouseSearchStatus;
  rating: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdRow {
  id: string;
  name: string;
  invite_code: string;
}

export function rowToEntry(row: EntryRow): HouseSearchEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by,
    husnummerId: row.husnummer_id,
    addressLabel: row.address_label,
    postalCode: row.postal_code,
    lat: row.lat,
    lon: row.lon,
    seenAt: row.seen_at,
    askingPriceDkk: row.asking_price_dkk,
    rooms: row.rooms,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToHousehold(row: HouseholdRow): Household {
  return { id: row.id, name: row.name, inviteCode: row.invite_code };
}

export function inputToInsertRow(input: HouseSearchEntryInput, householdId: string, userId: string) {
  return {
    household_id: householdId,
    created_by: userId,
    husnummer_id: input.husnummerId,
    address_label: input.addressLabel,
    postal_code: input.postalCode,
    lat: input.lat,
    lon: input.lon,
    seen_at: input.seenAt,
    asking_price_dkk: input.askingPriceDkk,
    rooms: input.rooms,
    status: input.status,
    rating: input.rating,
    notes: input.notes,
  };
}

/** Fields that can change after an entry is created. The address is fixed: to move an entry, delete and re-add it. */
export type EntryPatch = Pick<HouseSearchEntryInput, "seenAt" | "askingPriceDkk" | "rooms" | "status" | "rating" | "notes">;

export function patchToUpdateRow(patch: EntryPatch) {
  return {
    seen_at: patch.seenAt,
    asking_price_dkk: patch.askingPriceDkk,
    rooms: patch.rooms,
    status: patch.status,
    rating: patch.rating,
    notes: patch.notes,
  };
}

export type HouseSearchErrorCode = "duplicate" | "invalidCode" | "householdFull" | "alreadyMember" | "unknown";

export class HouseSearchError extends Error {
  constructor(
    public code: HouseSearchErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Maps a PostgREST/Postgres error onto a code the UI can translate. Never leaks the raw database message to the user. */
export function toHouseSearchError(error: { code?: string; message?: string } | null | undefined): HouseSearchError {
  const message = error?.message ?? "Unknown error";
  switch (error?.code) {
    case "P0002":
      return new HouseSearchError("invalidCode", message);
    case "54000":
      return new HouseSearchError("householdFull", message);
    case "23505":
      // join/create raise 23505 for "already in a household"; the entries table raises it for the same house and day.
      return new HouseSearchError(/already in a household/i.test(message) ? "alreadyMember" : "duplicate", message);
    default:
      return new HouseSearchError("unknown", message);
  }
}

/** The family's shared log of individual listings they have looked at (/house-search). */

export const HOUSE_SEARCH_STATUSES = ["interested", "visited", "rejected"] as const;
export type HouseSearchStatus = (typeof HOUSE_SEARCH_STATUSES)[number];

export interface Household {
  id: string;
  name: string;
  /** Share with the partner. Anyone signed in who has it can join (max 6 members). */
  inviteCode: string;
}

export interface HouseSearchEntry {
  id: string;
  householdId: string;
  createdBy: string;
  /** DAR husnummer UUID from the address autocomplete. */
  husnummerId: string;
  addressLabel: string;
  postalCode: string | null;
  /** WGS84. Null when the coordinate lookup failed; such an entry is not drawn on the map. */
  lat: number | null;
  lon: number | null;
  /** ISO date (YYYY-MM-DD) the household saw the listing. */
  seenAt: string;
  askingPriceDkk: number | null;
  rooms: number | null;
  status: HouseSearchStatus;
  /** 1 to 5, or null when not rated. */
  rating: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** What the form submits. Location is resolved from `husnummerId` before saving. */
export interface HouseSearchEntryInput {
  husnummerId: string;
  addressLabel: string;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  seenAt: string;
  askingPriceDkk: number | null;
  rooms: number | null;
  status: HouseSearchStatus;
  rating: number | null;
  notes: string;
}

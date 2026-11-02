import type { Household, HouseSearchEntry, HouseSearchEntryInput } from "@shared/types/house-search";
import { supabase } from "./supabase";
import {
  inputToInsertRow,
  patchToUpdateRow,
  rowToEntry,
  rowToHousehold,
  toHouseSearchError,
  type EntryPatch,
  type EntryRow,
  type HouseholdRow,
} from "./house-search-rows";

/*
 * Talks to Supabase directly. Row-level security (migration 033) is what keeps a household's
 * entries private, so no serverless function is needed. api/ is already at the Hobby plan's cap of 12.
 */

export async function getMyHousehold(userId: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("households(id, name, invite_code)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw toHouseSearchError(error);
  const household = (data as { households: HouseholdRow | null } | null)?.households;
  return household ? rowToHousehold(household) : null;
}

export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc("create_household", { p_name: name });
  if (error) throw toHouseSearchError(error);
  return rowToHousehold(data as HouseholdRow);
}

export async function joinHousehold(inviteCode: string): Promise<Household> {
  const { data, error } = await supabase.rpc("join_household", { p_code: inviteCode });
  if (error) throw toHouseSearchError(error);
  return rowToHousehold(data as HouseholdRow);
}

export async function listEntries(householdId: string): Promise<HouseSearchEntry[]> {
  const { data, error } = await supabase
    .from("house_search_entries")
    .select("*")
    .eq("household_id", householdId)
    .order("seen_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw toHouseSearchError(error);
  return (data as EntryRow[]).map(rowToEntry);
}

export async function createEntry(householdId: string, userId: string, input: HouseSearchEntryInput): Promise<HouseSearchEntry> {
  const { data, error } = await supabase.from("house_search_entries").insert(inputToInsertRow(input, householdId, userId)).select("*").single();
  if (error) throw toHouseSearchError(error);
  return rowToEntry(data as EntryRow);
}

export async function updateEntry(id: string, patch: EntryPatch): Promise<HouseSearchEntry> {
  const { data, error } = await supabase.from("house_search_entries").update(patchToUpdateRow(patch)).eq("id", id).select("*").single();
  if (error) throw toHouseSearchError(error);
  return rowToEntry(data as EntryRow);
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("house_search_entries").delete().eq("id", id);
  if (error) throw toHouseSearchError(error);
}

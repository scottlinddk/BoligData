import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HouseSearchEntry } from "@shared/types/house-search";
import { createEntry, deleteEntry, listEntries, updateEntry } from "@/lib/house-search-api";
import { resolveHusnummer } from "@/lib/house-search-geocode";
import type { EntryPatch } from "@/lib/house-search-rows";
import { withLocation, type ParsedEntry } from "@/lib/house-search-schema";
import { useAuth } from "@/hooks/use-auth";

export const entriesKey = (householdId: string | undefined) => ["house-search-entries", householdId] as const;

type ValidInput = Extract<ParsedEntry, { ok: true }>["input"];

/** The household's entries plus add / edit / delete. Every household member sees the same list. */
export function useHouseSearchEntries(householdId: string | undefined) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = entriesKey(householdId);
  const refresh = () => client.invalidateQueries({ queryKey: key });

  const query = useQuery({
    queryKey: key,
    queryFn: () => listEntries(householdId!),
    enabled: !!householdId,
  });

  const add = useMutation({
    mutationFn: async (input: ValidInput) => {
      // A failed lookup never blocks saving: the entry just stays off the map (see resolveHusnummer).
      const resolved = await resolveHusnummer(input.husnummerId);
      return createEntry(householdId!, user!.id, withLocation(input, resolved));
    },
    onSuccess: refresh,
  });

  const edit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntryPatch }) => updateEntry(id, patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (entry: HouseSearchEntry) => deleteEntry(entry.id),
    onSuccess: refresh,
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    add,
    edit,
    remove,
  };
}

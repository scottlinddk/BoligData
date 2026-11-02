import type { HouseSearchEntry } from "@shared/types/house-search";
import { WorkspaceEmpty } from "@/components/dashboard/workspace";
import { useI18n } from "@/i18n/i18n";
import type { EntryPatch } from "@/lib/house-search-rows";
import { EntryCard } from "./entry-card";

interface EntryListProps {
  /** Entries after filtering. */
  entries: HouseSearchEntry[];
  /** Entries before filtering, to tell "nothing yet" from "nothing matches". */
  totalCount: number;
  onEdit: (id: string, patch: EntryPatch) => Promise<unknown>;
  onDelete: (entry: HouseSearchEntry) => void;
  busy: boolean;
}

export function EntryList({ entries, totalCount, onEdit, onDelete, busy }: EntryListProps) {
  const { t } = useI18n();
  if (totalCount === 0) return <WorkspaceEmpty title={t("hs.list.emptyTitle")} description={t("hs.list.emptyBody")} />;
  if (entries.length === 0) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-soft">{t("hs.list.noMatch")}</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label={t("hs.list.title")}>
      {entries.map((entry) => <EntryCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} busy={busy} />)}
    </ul>
  );
}

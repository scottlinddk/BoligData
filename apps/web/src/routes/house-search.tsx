import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EntryForm } from "@/components/house-search/entry-form";
import { EntryList } from "@/components/house-search/entry-list";
import { FilterBar } from "@/components/house-search/filter-bar";
import { HeatmapMap } from "@/components/house-search/heatmap-map";
import { HouseholdGate } from "@/components/house-search/household-gate";
import { StatsPanel } from "@/components/house-search/stats-panel";
import { houseSearchErrorKey } from "@/components/house-search/error-key";
import { LoadingStatus } from "@/components/ui/loading";
import { buttonClass } from "@/components/research/fields";
import { useHouseSearchEntries } from "@/hooks/use-house-search-entries";
import { useHousehold } from "@/hooks/use-household";
import { useI18n } from "@/i18n/i18n";
import { applyFilters, parseFilters, serializeFilters, type HouseSearchFilters } from "@/lib/house-search-filters";
import { summarize } from "@/lib/house-search-stats";

/** A household's shared log of listings: statistics, and a heatmap of where the family is searching. */
export function HouseSearchPage() {
  const { t } = useI18n();
  const { household, isLoading, isError } = useHousehold();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("hs.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t("hs.subtitle")}</p>
      </header>

      {isLoading && <LoadingStatus>{t("hs.loading")}</LoadingStatus>}
      {isError && <p role="alert" className="text-sm text-danger">{t("hs.loadError")}</p>}
      {!isLoading && !isError && !household && <HouseholdGate />}
      {household && <Workspace householdId={household.id} householdName={household.name} inviteCode={household.inviteCode} />}
    </div>
  );
}

function Workspace({ householdId, householdName, inviteCode }: { householdId: string; householdName: string; inviteCode: string }) {
  const { t } = useI18n();
  const { entries, isLoading, isError, add, edit, remove } = useHouseSearchEntries(householdId);
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState(false);

  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = (next: HouseSearchFilters) => setParams(serializeFilters(next, params), { replace: true });

  const filtered = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const stats = useMemo(() => summarize(filtered), [filtered]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is on screen to copy by hand.
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
        <span className="font-semibold text-ink">{householdName}</span>
        <span>{t("hs.household.inviteLabel")}:</span>
        <code className="rounded-md bg-surface-alt px-2 py-1 font-mono tracking-widest text-ink">{inviteCode}</code>
        <button type="button" className={`${buttonClass} !px-3 !py-1 text-xs`} onClick={copyCode} aria-live="polite">
          {copied ? t("hs.household.copied") : t("hs.household.copy")}
        </button>
      </div>

      {isLoading && <LoadingStatus>{t("hs.loading")}</LoadingStatus>}
      {isError && <p role="alert" className="text-sm text-danger">{t("hs.loadError")}</p>}

      <FilterBar filters={filters} onChange={setFilters} shown={filtered.length} total={entries.length} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <EntryForm onAdd={(input) => add.mutateAsync(input)} saving={add.isPending} />
        <HeatmapMap entries={filtered} />
      </div>

      <StatsPanel stats={stats} />

      <EntryList
        entries={filtered}
        totalCount={entries.length}
        onEdit={(id, patch) => edit.mutateAsync({ id, patch })}
        onDelete={(entry) => remove.mutate(entry)}
        busy={edit.isPending || remove.isPending}
      />
      {remove.isError && <p role="alert" className="text-sm text-danger">{t(houseSearchErrorKey(remove.error))}</p>}
    </div>
  );
}

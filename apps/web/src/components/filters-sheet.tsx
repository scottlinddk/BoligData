import type { FiltersWithSort } from "@/lib/url-filters";
import { FilterFields } from "@/components/filter-fields";
import { useI18n } from "@/i18n/i18n";

interface FiltersSheetProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
  onClose: () => void;
}

const SHEET_FIELD_LABEL = "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-soft";
const SHEET_FIELD_INPUT =
  "w-full rounded-full border border-border bg-surface-alt px-3.5 py-2.5 font-sans text-sm font-medium normal-case tracking-normal text-ink placeholder:text-ink-faint";

export function FiltersSheet({ filters, onChange, onClose }: FiltersSheetProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 animate-fade-up bg-black/50" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col gap-3.5 overflow-y-auto rounded-t-[20px] bg-surface p-4.5 pb-[90px] shadow-lift animate-fade-up">
        <div className="flex items-center justify-between">
          <span className="text-base font-extrabold text-ink">{t("filters.title")}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("filters.close")}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-surface-alt text-ink-soft"
          >
            ✕
          </button>
        </div>

        <FilterFields filters={filters} onChange={onChange} fieldLabelClassName={SHEET_FIELD_LABEL} fieldInputClassName={SHEET_FIELD_INPUT} />

        <div className="mt-1 flex gap-2.5">
          <button
            type="button"
            onClick={() =>
              onChange({
                location: null,
                postnummer: null,
                minPrice: null,
                maxPrice: null,
                minSqm: null,
                maxSqm: null,
                maxDaysOnMarket: null,
                minBuildingYear: null,
                maxBuildingYear: null,
              })
            }
            className="flex-1 rounded-full border border-border-strong bg-surface px-3 py-3 text-sm font-bold text-ink"
          >
            {t("filters.reset")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-[2] rounded-full bg-cta px-3 py-3 text-sm font-bold text-cta-text"
          >
            {t("filters.title")}
          </button>
        </div>
      </div>
    </div>
  );
}

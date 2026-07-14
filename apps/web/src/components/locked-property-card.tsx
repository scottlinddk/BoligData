import { Link } from "react-router-dom";
import type { PropertySummary } from "@shared/types/index";
import { useI18n } from "@/i18n/i18n";

/**
 * Card shown for unauthenticated search results. The API withholds everything
 * but id/address for anonymous requests, so this mirrors PropertyCard's shell
 * without fabricating price/size data the client never received.
 */
export function LockedPropertyCard({ summary }: { summary: PropertySummary }) {
  const { t } = useI18n();

  return (
    <Link
      to={`/property/${summary.id}`}
      className="block overflow-hidden rounded-[20px] border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-border-strong"
    >
      <div className="flex h-[150px] flex-col items-center justify-center gap-1 bg-surface-alt text-ink-faint">
        <span className="font-mono text-[9px]">{t("property.noPhoto")}</span>
      </div>
      <div className="p-3.5">
        <h3 className="text-[15.5px] font-semibold text-ink">{summary.address}</h3>
        <div className="mt-2.5 flex animate-pulse flex-col gap-1.5">
          <div className="h-[20px] w-3/5 rounded bg-surface-alt" />
          <div className="h-3 w-2/5 rounded bg-surface-alt" />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-brand-text">
          <span className="font-mono text-[10px]">{t("search.signInLock")}</span>
        </div>
      </div>
    </Link>
  );
}

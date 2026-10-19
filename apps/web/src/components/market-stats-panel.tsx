import type { MarketStatPoint, MarketStatsResponse } from "@shared/types/api";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { SparklineChart } from "./sparkline-chart";

function StatBlock({ label, points, format }: { label: string; points: MarketStatPoint[]; format: (v: number) => string }) {
  const { t } = useI18n();
  const latest = points[points.length - 1];
  const yoy =
    latest && latest.prevYearValue ? ((latest.value - latest.prevYearValue) / latest.prevYearValue) * 100 : null;
  return (
    <div>
      <div className="text-xs font-bold text-ink">{label}</div>
      <SparklineChart points={points.map((p) => p.value)} />
      {latest && (
        <div className="mt-1 text-xs font-medium text-ink-soft">
          {format(latest.value)}
          {yoy !== null && ` · ${t("marketStats.yoy", { pct: (yoy > 0 ? "+" : "") + yoy.toFixed(1) })}`}
        </div>
      )}
    </div>
  );
}

export function MarketStatsPanel({ stats }: { stats: MarketStatsResponse }) {
  const { t } = useI18n();
  const empty = stats.pricePerSqm.length === 0 && stats.daysOnMarket.length === 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-2 text-[15px] font-extrabold text-ink">
        {t("marketStats.title", { municipality: stats.municipality })}
      </h3>
      {empty ? (
        <p className="text-xs font-medium text-ink-faint">{t("marketStats.none")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <StatBlock label={t("marketStats.pricePerSqm")} points={stats.pricePerSqm} format={(v) => `${formatDkk(v)}/m²`} />
          <StatBlock label={t("marketStats.daysOnMarket")} points={stats.daysOnMarket} format={(v) => String(Math.round(v))} />
        </div>
      )}
    </div>
  );
}

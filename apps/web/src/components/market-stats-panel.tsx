import type { MarketStatPoint, MarketStatsResponse, RegionalMarketStats } from "@shared/types/api";
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

function RegionalSection({ regional }: { regional: RegionalMarketStats }) {
  const { t } = useI18n();
  const latestIndexChange = regional.priceChangeYoy[regional.priceChangeYoy.length - 1];
  return (
    <div className="mt-4 border-t border-border pt-3">
      <h4 className="mb-2 text-[13px] font-extrabold text-ink">
        {t("marketStats.regionalTitle", { region: regional.regionName })}
      </h4>
      <div className="flex flex-col gap-3">
        <StatBlock label={t("marketStats.avgPrice")} points={regional.avgPrice} format={(v) => formatDkk(v)} />
        <StatBlock label={t("marketStats.salesCount")} points={regional.salesCount} format={(v) => String(Math.round(v))} />
      </div>
      {latestIndexChange && (
        <div className="mt-2 text-xs font-medium text-ink-soft">
          {t("marketStats.indexYoy", { pct: (latestIndexChange.value > 0 ? "+" : "") + latestIndexChange.value.toFixed(1) })}
        </div>
      )}
      <p className="mt-2 text-[11px] font-medium text-ink-faint">{t("marketStats.regionalSource")}</p>
    </div>
  );
}

export function MarketStatsPanel({ stats }: { stats: MarketStatsResponse }) {
  const { t } = useI18n();
  const hasRegional = !!stats.regional && stats.regional.avgPrice.length > 0;
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
      {hasRegional && <RegionalSection regional={stats.regional!} />}
    </div>
  );
}

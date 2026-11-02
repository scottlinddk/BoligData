import type { HouseSearchStats, Range } from "@/lib/house-search-stats";
import { MIN_LIKED_FOR_PREFERENCE } from "@/lib/house-search-stats";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { formatDkk, formatDkkShort, formatMonth, formatNumber } from "@/lib/house-search-format";
import { BarList } from "./bar-list";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-alt p-3">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/** Statistics over the (filtered) entries, plus a deliberately cautious reading of what the family seems to want. */
export function StatsPanel({ stats }: { stats: HouseSearchStats }) {
  const { t, language } = useI18n();
  const dash = "-";
  const rangeText = (r: Range, fmt: (n: number) => string) => ({ low: fmt(r.low), high: fmt(r.high) });
  const money = (n: number) => formatDkkShort(n, language);
  const num = (n: number) => formatNumber(n, language);

  if (stats.total === 0) {
    return <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-ink-soft">{t("hs.stats.empty")}</p>;
  }

  const missingPrice = stats.total - stats.withPrice;
  const sweet = stats.sweetSpot;

  return (
    <div className="grid gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 className="text-lg font-bold tracking-tight">{t("hs.stats.title")}</h3>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("hs.stats.total")} value={String(stats.total)} />
        <Kpi label={t("hs.stats.medianPrice")} value={stats.price ? money(stats.price.median) : dash} />
        <Kpi label={t("hs.stats.priceRange")} value={stats.price ? `${money(stats.price.min)} - ${money(stats.price.max)}` : dash} />
        <Kpi label={t("hs.stats.medianRooms")} value={stats.medianRooms === null ? dash : num(stats.medianRooms)} />
      </dl>
      {missingPrice > 0 && <p className="-mt-2 text-xs text-ink-soft">{t("hs.stats.missingPrice", { count: missingPrice })}</p>}

      <section aria-labelledby="hs-pref-title" className="rounded-xl border border-brand/40 bg-brand-soft p-3 sm:p-4">
        <h4 id="hs-pref-title" className="text-sm font-bold text-brand-text">{t("hs.pref.title")}</h4>
        {sweet ? (
          <ul className="mt-2 grid gap-1 text-sm text-ink">
            {sweet.price && <li>{t("hs.pref.price", rangeText(sweet.price, money))}</li>}
            {sweet.rooms && <li>{t("hs.pref.rooms", rangeText(sweet.rooms, num))}</li>}
            {sweet.topPostalCode && <li>{t("hs.pref.postal", { code: sweet.topPostalCode })}</li>}
            <li className="mt-1 text-xs text-ink-soft">{t("hs.pref.basis", { count: sweet.count })}</li>
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">{t("hs.pref.need", { min: MIN_LIKED_FOR_PREFERENCE, count: stats.likedCount })}</p>
        )}
        {stats.rejectedVsKept && (
          <div className="mt-3 border-t border-brand/30 pt-2">
            <h5 className="text-xs font-bold text-ink-soft">{t("hs.pref.rejectedTitle")}</h5>
            <ul className="mt-1 grid gap-0.5 text-xs text-ink">
              {([["hs.pref.rejected", stats.rejectedVsKept.rejected], ["hs.pref.kept", stats.rejectedVsKept.kept]] as const).map(([label, g]) => (
                <li key={label}>
                  {t("hs.pref.rejectedRow", {
                    label: t(label as TranslationKey),
                    count: g.count,
                    price: g.medianPrice === null ? t("hs.pref.unknown") : formatDkk(g.medianPrice, language),
                    rooms: g.medianRooms === null ? t("hs.pref.unknown") : num(g.medianRooms),
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <BarList
          title={t("hs.stats.priceBands")}
          emptyLabel={t("hs.stats.empty")}
          items={stats.priceBands.map((b) => ({ key: String(b.from), label: `${money(b.from)} - ${money(b.to)}`, value: b.count }))}
        />
        <BarList
          title={t("hs.stats.roomsDistribution")}
          emptyLabel={t("hs.stats.empty")}
          items={stats.roomsDistribution.map((r) => ({ key: String(r.rooms), label: t("hs.list.rooms", { count: r.rooms }), value: r.count }))}
        />
        <BarList
          title={t("hs.stats.byPostalCode")}
          emptyLabel={t("hs.stats.empty")}
          items={stats.byPostalCode.slice(0, 8).map((p) => ({ key: p.postalCode, label: p.postalCode, value: p.count }))}
        />
        <BarList
          title={t("hs.stats.byMonth")}
          emptyLabel={t("hs.stats.empty")}
          items={stats.byMonth.slice(-12).map((m) => ({ key: m.month, label: formatMonth(m.month, language), value: m.count }))}
        />
      </div>
    </div>
  );
}

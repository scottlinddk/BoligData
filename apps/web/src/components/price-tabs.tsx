import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/i18n";
import { SmartEstimate } from "@/components/estimate/smart-estimate";
import { SparPanel } from "@/components/spar-panel";
import { BoligDataIndicatorCard } from "@/components/estimate/boligdata-indicator-card";
import { useSparEstimate } from "@/hooks/use-spar";
import { boligdataIndicator } from "@/lib/boligdata-indicator";

type PriceTab = "estimate" | "spar";

/** Shared links keep working: each old section anchor now opens its tab. */
const TAB_BY_HASH: Record<string, PriceTab> = { "#estimate": "estimate", "#spar": "spar" };

const scrollBehavior = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

/**
 * The price indicators of a home, one at a time: the smart estimate and the SPAR fair price. Panels stay
 * mounted (only hidden) so their data loads once and switching tabs is instant.
 */
export function PriceTabs({ propertyId, propertyType, askingPriceDkk = null }: {
  propertyId: string; propertyType?: string | null; askingPriceDkk?: number | null;
}) {
  const { language } = useI18n();
  const spar = useSparEstimate(propertyId).data;
  // Smart estimate and SPAR fair price are one number, so it enters the indicator once.
  const indicator = boligdataIndicator({ sparPriceDkk: spar?.status === "available" ? spar.fairPrice?.estimate : null, timeOnMarketPriceDkk: null, askingPriceDkk });
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [active, setActive] = useState<PriceTab>(() => TAB_BY_HASH[window.location.hash] ?? "estimate");
  const root = useRef<HTMLDivElement>(null);
  const tabs: { id: PriceTab; label: string }[] = [
    { id: "estimate", label: tx("Smart estimat", "Smart estimate") },
    { id: "spar", label: tx("SPAR og fair pris (estimat)", "SPAR and fair price (estimate)") },
  ];

  useEffect(() => {
    const onHash = () => {
      const tab = TAB_BY_HASH[window.location.hash];
      if (!tab) return;
      setActive(tab);
      requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function select(tab: PriceTab, focus = false) {
    setActive(tab);
    if (focus) requestAnimationFrame(() => document.getElementById(`price-tab-${tab}`)?.focus());
  }

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex(tab => tab.id === active);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]!.id, true);
  }

  const showCalculation = () => {
    setActive("spar");
    requestAnimationFrame(() => document.getElementById("spar")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }));
  };

  const panel = (id: PriceTab, children: ReactNode) => <div role="tabpanel" id={`price-panel-${id}`} aria-labelledby={`price-tab-${id}`} hidden={active !== id} tabIndex={-1} className="min-w-0 [&>section]:mt-0">{children}</div>;

  return <div ref={root} className="section-anchor min-w-0">
    {indicator && <BoligDataIndicatorCard indicator={indicator} />}
    <div role="tablist" aria-label={tx("Prisindikatorer", "Price indicators")} onKeyDown={onKeyDown}
      className="mb-3 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-alt p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`price-tab-${tab.id}`} aria-selected={active === tab.id} aria-controls={`price-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => select(tab.id)}
        className={`min-h-11 shrink-0 grow whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active === tab.id ? "bg-cta text-cta-text shadow-card" : "text-ink-soft hover:bg-surface-hover hover:text-ink"}`}>
        {tab.label}
      </button>)}
    </div>
    {panel("estimate", <SmartEstimate propertyId={propertyId} propertyType={propertyType} onShowCalculation={showCalculation} />)}
    {panel("spar", <div id="spar" className="section-anchor"><SparPanel propertyId={propertyId} /></div>)}
  </div>;
}

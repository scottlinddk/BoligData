import { useId, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import type { ListingImage, Property } from "@shared/types/index";
import { getImageSrcSet, getImageUrl, getPhotos } from "@shared/utils/image";
import { formatDkk } from "@shared/utils/price";
import { useI18n } from "@/i18n/i18n";
import { BrandMark } from "@/components/brand-mark";
import { PropertyCard } from "@/components/property-card";
import { Skeleton } from "@/components/ui/loading";
import { fallbackToOriginalImage } from "@/lib/image-fallback";
import "./workspace.css";

function WorkspaceIcon({ kind }: { kind: "project" | "overview" | "recommendations" | "arrow" }) {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "project" && <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-8h6v8" /></>}
    {kind === "overview" && <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
    {kind === "recommendations" && <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></>}
    {kind === "arrow" && <path d="M4 12h16m-6-6 6 6-6 6" />}
  </svg>;
}

export function DashboardWorkspace({ title, description, sidebar, children, detail, actions }: {
  title: string; description: string; sidebar: ReactNode; children: ReactNode; detail: ReactNode; actions?: ReactNode;
}) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsId = useId();
  return <div className="dashboard-workspace">
    <div className="workspace-heading">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-text">{tx("Dit arbejdsrum", "Your workspace")}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-ink sm:text-[32px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-ink-soft">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label={tx("Navigation og filtre", "Navigation and filters")}>
        <nav className="workspace-navigation" aria-label={tx("Arbejdsrum", "Workspace")}>
          {([
            ["/research", "project", tx("Boligprojekt", "Buying project")],
            ["/dashboard", "overview", tx("Overblik", "Overview")],
            ["/recommendations", "recommendations", tx("Anbefalinger", "Recommendations")],
          ] as const).map(([to, kind, label]) => <NavLink key={to} to={to} className={({ isActive }) => `workspace-route ${isActive ? "workspace-route-active" : ""}`}><WorkspaceIcon kind={kind} /><span>{label}</span></NavLink>)}
        </nav>
        <button type="button" className="workspace-controls-toggle" aria-expanded={controlsOpen} aria-controls={controlsId} onClick={() => setControlsOpen(value => !value)}>
          {tx("Visninger og filtre", "Views and filters")}<span aria-hidden="true">{controlsOpen ? "−" : "+"}</span>
        </button>
        <div id={controlsId} className={`workspace-controls ${controlsOpen ? "workspace-controls-open" : ""}`}>{sidebar}</div>
        <div className="workspace-sidebar-footer"><span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />{tx("Plads til din næste bolig", "Room for your next home")}</div>
      </aside>
      <div className="workspace-content">{children}</div>
      <aside id="workspace-detail" tabIndex={-1} className="workspace-detail" aria-label={tx("Detaljer og næste skridt", "Details and next steps")}>{detail}</aside>
    </div>
  </div>;
}

export function WorkspaceSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="workspace-section"><h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{title}</h2>{children}</section>;
}

export function WorkspaceNavButton({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${active ? "bg-brand-soft font-semibold text-brand-text" : "text-ink-soft hover:bg-surface-alt hover:text-ink"}`}>
    <span>{children}</span>{count !== undefined && <span className={`min-w-6 rounded-md px-1.5 py-0.5 text-center text-[11px] tabular-nums ${active ? "bg-surface text-brand-text" : "bg-surface-alt text-ink-soft"}`}>{count}</span>}
  </button>;
}

export function WorkspaceEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-text"><BrandMark className="h-6 w-6" /></span>
    <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
    <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

export function WorkspaceStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0 rounded-xl border border-border bg-surface p-3"><dt className="text-[10px] leading-4 text-ink-soft">{label}</dt><dd className="mt-1 break-words text-lg font-semibold tracking-tight text-ink">{value}</dd></div>;
}

export function WorkspacePropertyCard({ property, active, onPreview, children }: { property: Property; active?: boolean; onPreview?: () => void; children?: ReactNode }) {
  const { language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  function preview() {
    onPreview?.();
    // The detail column follows the results on compact screens. Move keyboard
    // focus with the view so the selected property is immediately reachable.
    if (window.matchMedia("(max-width: 1199px)").matches) {
      const panel = document.getElementById("workspace-detail");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  }
  return <div className={`workspace-property-card ${active ? "workspace-property-card-active" : ""}`}>
    <PropertyCard property={property} />
    {children && <div className="mt-3 border-t border-border pt-3">{children}</div>}
    {onPreview && <button type="button" aria-pressed={!!active} aria-controls="workspace-detail" aria-label={`${tx("Vis detaljer for", "View details for")} ${property.address}`} onClick={preview} className={`mt-3 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors ${active ? "bg-brand-soft text-brand-text" : "bg-surface-alt text-ink-soft hover:bg-brand-soft hover:text-brand-text"}`}>
      {active ? tx("Valgt bolig", "Selected property") : tx("Vis detaljer", "View details")}<WorkspaceIcon kind="arrow" />
    </button>}
  </div>;
}

function PreviewPhoto({ photo, alt }: { photo?: ListingImage; alt: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  if (!photo || state === "error") return <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-faint"><BrandMark className="h-10 w-10 opacity-40" /><span className="text-xs">{t("property.noPhoto")}</span></div>;
  return <>
    {state === "loading" && <Skeleton className="absolute inset-0 h-full w-full" />}
    <img src={getImageUrl(photo, 800, 600)} srcSet={getImageSrcSet(photo, [400, 600, 800], 4 / 3)} sizes="(min-width: 1200px) 320px, (min-width: 768px) 60vw, 90vw" alt={alt} className={`h-full w-full object-cover ${state === "loaded" ? "opacity-100" : "opacity-0"}`} onLoad={() => setState("loaded")} onError={event => {
      const element = event.currentTarget;
      if (!element.srcset && element.getAttribute("src") === photo.url) setState("error");
      else fallbackToOriginalImage(element, photo.url);
    }} />
  </>;
}

export function WorkspacePropertyPreview({ property, children }: { property: Property; children?: ReactNode }) {
  const { t, language } = useI18n();
  const tx = (da: string, en: string) => language === "da" ? da : en;
  const photo = getPhotos(property.images)[0];
  return <div>
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">{tx("Boligen i fokus", "Property in focus")}</p>
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-alt">
      <PreviewPhoto key={`${property.id}:${photo?.url}`} photo={photo} alt={property.address} />
      <span className="absolute bottom-3 left-3 rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold text-ink shadow-card">{property.listingSource}</span>
    </div>
    {property.status !== "active" && <p className="mt-4"><span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning-text">{t(`property.status.${property.status}`)}</span></p>}
    <h2 className="mt-4 break-words text-lg font-semibold leading-7 tracking-tight text-ink">{property.address}</h2>
    <p className="mt-0.5 text-xs text-ink-soft">{[property.postalCode, property.municipality].filter(Boolean).join(" ")}</p>
    <div className="mt-4">
      {property.status !== "active" && <p className="mb-1 text-xs text-ink-soft">{t("property.lastAskingPrice")}</p>}
      <p className="text-2xl font-bold tracking-[-0.04em] text-ink">{formatDkk(property.price)}</p>
    </div>
    <dl className="workspace-property-facts mt-4 grid grid-cols-3 gap-2">
      <WorkspaceStat label={tx("Boligareal", "Living area")} value={`${property.sqm} m²`} />
      <WorkspaceStat label={tx("Rum i annoncen", "Listed rooms")} value={property.rooms || "—"} />
      <WorkspaceStat label={tx("Energi", "Energy")} value={property.bbrData?.energyLabel || "—"} />
    </dl>
    <Link to={`/property/${property.id}`} className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-text transition-colors hover:bg-cta-hover">{tx("Åbn bolig", "Open property")}<WorkspaceIcon kind="arrow" /></Link>
    {children && <div className="mt-5 border-t border-border pt-5">{children}</div>}
  </div>;
}

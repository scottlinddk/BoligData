import { useEffect, useRef } from "react";
import type { FiltersWithSort } from "@/lib/url-filters";
import { defaultFilters } from "@/lib/url-filters";
import { FilterFields } from "@/components/filter-fields";
import { useI18n } from "@/i18n/i18n";

interface FiltersSheetProps {
  filters: FiltersWithSort;
  onChange: (patch: Partial<FiltersWithSort>) => void;
  onClose: () => void;
}

/** Native modal keeps keyboard focus inside and restores it to the opener. */
export function FiltersSheet({ filters, onChange, onClose }: FiltersSheetProps) {
  const { t, language } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={dialogRef} aria-labelledby="search-filters-title" onCancel={onClose}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={e => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}
    className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[24px] border border-border bg-surface p-0 text-ink shadow-lift backdrop:bg-black/35 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-[600px] sm:rounded-[24px]">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-5 sm:px-8"><h2 id="search-filters-title" className="text-2xl font-medium tracking-tight">{t("filters.title")}</h2><button type="button" onClick={onClose} aria-label={t("filters.close")} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-ink-soft transition hover:bg-surface-hover">✕</button></div>
    <div className="grid grid-cols-2 items-start gap-x-3 gap-y-6 bg-surface-alt p-6 sm:p-8"><FilterFields filters={filters} onChange={onChange} /></div>
    {filters.polygon && <p className="mx-6 mb-5 rounded-xl bg-brand-soft p-3 text-sm text-brand-text">{language === "da" ? "Søgningen er afgrænset af dit markerede område på kortet." : "This search is limited to your drawn map boundary."}</p>}
    <div className="sticky bottom-0 flex gap-3 border-t border-border bg-surface px-6 py-5 sm:px-8"><button type="button" onClick={() => onChange({ ...defaultFilters(), polygon: null })} className="flex-1 rounded-full border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:bg-surface-alt">{t("filters.reset")}</button><button type="button" onClick={onClose} className="flex-[2] rounded-full bg-cta px-4 py-3 text-sm font-semibold text-cta-text transition hover:bg-cta-hover">{language === "da" ? "Vis boliger" : "Show homes"}</button></div>
  </dialog>;
}

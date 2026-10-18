import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/i18n";

function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { language } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}
    className="ui-enter fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-ink shadow-lift backdrop:bg-black/50 sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
      <button type="button" onClick={onClose} aria-label={language === "da" ? "Luk" : "Close"}
        className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <div className="mt-3 space-y-4 text-sm leading-6">{children}</div>
  </dialog>;
}

/** An "i" icon button that opens an explanation in a modal. The modal is only mounted while open. */
export function InfoButton({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={label} title={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-soft transition hover:bg-surface-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 11v6M12 7h.01" /></svg>
    </button>
    {open && <InfoModal title={title} onClose={() => setOpen(false)}>{children}</InfoModal>}
  </>;
}

/** Building blocks for explanation content, so the modals share one visual rhythm. */
export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="text-sm font-semibold">{title}</h3><div className="mt-1.5 space-y-2 text-ink-soft">{children}</div></section>;
}

export function InfoFormula({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-border bg-surface-alt px-4 py-3 text-[13px] font-semibold leading-6 text-ink">{children}</p>;
}

export function InfoSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-ink-soft">{children}</ol>;
}

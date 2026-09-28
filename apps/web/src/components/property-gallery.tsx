import { useEffect, useRef, useState } from "react";
import type { ListingImage } from "@shared/types/index";
import { getImageSrcSet, getImageUrl } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";
import { fallbackToOriginalImage } from "@/lib/image-fallback";
import { LoadingStatus, Skeleton } from "@/components/ui/loading";

function GalleryPhoto({ image, alt, variant }: { image: ListingImage; alt: string; variant: "hero" | "thumbnail" | "modal" }) {
  const { t, language } = useI18n();
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const hero = variant === "hero";
  const modal = variant === "modal";

  return <div aria-busy={state === "loading"} className={`relative h-full w-full ${modal ? "pointer-events-none flex items-center justify-center text-white/80" : "text-ink-faint"}`}>
    {state === "loading" && (modal
      ? <LoadingStatus className="absolute inset-0 justify-center text-white/80">{language === "da" ? "Henter billede…" : "Loading photo…"}</LoadingStatus>
      : <Skeleton className="absolute inset-0 h-full w-full rounded-none" />)}
    {state === "error" ? <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm">{t("property.noPhoto")}</span>
      : <img src={getImageUrl(image, modal ? 2000 : hero ? 1800 : 600, modal ? 1333 : hero ? 1200 : 400)}
        srcSet={modal ? undefined : getImageSrcSet(image, hero ? [600, 900, 1200, 1800] : [300, 600, 900], 3 / 2)}
        sizes={modal ? undefined : hero ? "(min-width: 1024px) 760px, 100vw" : "(min-width: 1024px) 180px, 25vw"}
        alt={alt} loading={variant === "thumbnail" ? "lazy" : "eager"} fetchPriority={hero ? "high" : "auto"}
        onLoad={() => setState("loaded")}
        onError={event => {
          const element = event.currentTarget;
          if (!element.srcset && element.getAttribute("src") === image.url) setState("error");
          else fallbackToOriginalImage(element, image.url);
        }}
        className={`transition-[opacity,transform] duration-300 ${modal ? "pointer-events-auto max-h-full max-w-full rounded-lg object-contain" : "h-full w-full object-cover motion-safe:group-hover:scale-[1.025]"} ${state === "loaded" ? "opacity-100" : "opacity-0"}`} />}
  </div>;
}

/** Compact photo story, with every image available in a native modal dialog. */
export function PropertyGallery({ images, alt }: { images: ListingImage[]; alt: string }) {
  const { t, language } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const isOpen = openIndex !== null;

  useEffect(() => {
    if (!isOpen) return;
    const modal = dialog.current;
    modal?.showModal();
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [isOpen]);

  function open(index: number, button: HTMLButtonElement) {
    returnFocus.current = button;
    setOpenIndex(index);
  }
  function photo(image: ListingImage, index: number, hero = false) {
    return <GalleryPhoto key={image.url} image={image} alt={`${alt} · ${index + 1}`} variant={hero ? "hero" : "thumbnail"} />;
  }

  if (!images.length) return <div className="flex aspect-[3/2] items-center justify-center rounded-2xl bg-surface-alt text-sm text-ink-faint">{t("property.noPhoto")}</div>;

  return <section aria-label={t("detail.gallery")}>
    <button type="button" onClick={event => open(0, event.currentTarget)}
      aria-label={`${t("detail.gallery")} · ${images.length} ${language === "da" ? "billeder" : "photos"}`}
      className="group relative block aspect-[3/2] w-full overflow-hidden rounded-2xl bg-surface-alt text-left">
      {photo(images[0]!, 0, true)}
      <span className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-neutral-900 shadow-sm">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-4 w-4" aria-hidden="true"><rect x="3" y="5" width="14" height="11" rx="2" /><path d="m7 5 1-2h4l1 2" /><circle cx="10" cy="10.5" r="3" /></svg>
        {language === "da" ? "Se alle billeder" : "View all photos"} · {images.length}
      </span>
    </button>
    {images.length > 1 && <div className="mt-3 grid grid-cols-4 gap-2.5">
      {images.slice(1, 5).map((image, index) => <button key={`${image.url}-${index}`} type="button"
        onClick={event => open(index + 1, event.currentTarget)} aria-label={`${t("detail.gallery")} · ${index + 2}`}
        className="group relative aspect-[3/2] overflow-hidden rounded-xl bg-surface-alt">
        {photo(image, index + 1)}
        {index === 3 && images.length > 5 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-medium text-white">+{images.length - 5}</span>}
      </button>)}
    </div>}
    {openIndex !== null && <dialog ref={dialog} aria-label={t("detail.gallery")}
      onClose={() => setOpenIndex(null)} onCancel={() => setOpenIndex(null)}
      onClick={event => { if (event.target === event.currentTarget) setOpenIndex(null); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setOpenIndex(index => (index! - 1 + images.length) % images.length); }
        if (event.key === "ArrowRight") { event.preventDefault(); setOpenIndex(index => (index! + 1) % images.length); }
      }}
      className="ui-fade-in fixed inset-0 m-auto h-[100dvh] max-h-none w-screen max-w-none bg-black/95 p-4 text-white backdrop:bg-black/80 open:flex open:items-center open:justify-center">
      <button ref={closeButton} type="button" onClick={() => setOpenIndex(null)} aria-label={t("detail.galleryClose")}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl">×</button>
      <p aria-live="polite" className="absolute left-5 top-6 text-sm">{openIndex + 1} / {images.length}</p>
      <div className="pointer-events-none h-[85dvh] w-full max-w-[1800px]">
        <GalleryPhoto key={images[openIndex]!.url} image={images[openIndex]!} alt={`${alt} · ${openIndex + 1}`} variant="modal" />
      </div>
      {images.length > 1 && <>
        <button type="button" onClick={() => setOpenIndex(index => (index! - 1 + images.length) % images.length)} aria-label={t("detail.galleryPrev")} className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-3xl sm:left-6">‹</button>
        <button type="button" onClick={() => setOpenIndex(index => (index! + 1) % images.length)} aria-label={t("detail.galleryNext")} className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-3xl sm:right-6">›</button>
      </>}
    </dialog>}
  </section>;
}

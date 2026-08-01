import { useEffect, useState } from "react";
import type { ListingImage } from "@shared/types/index";
import { getImageSrcSet, getImageUrl } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";

interface PropertyGalleryProps {
  images: ListingImage[];
  alt: string;
}

/** Thumbnails span roughly half a phone screen up to a quarter of the 900px column. */
const THUMB_WIDTHS = [400, 600, 900, 1200];
const THUMB_ASPECT = 4 / 3;
/** The lightbox fills the viewport, so it needs full-screen-retina sizes. */
const LIGHTBOX_WIDTHS = [900, 1400, 2000, 2800];
const LIGHTBOX_ASPECT = 3 / 2;

/** Thumbnail grid of the remaining photos plus a full-screen lightbox. */
export function PropertyGallery({ images, alt }: PropertyGalleryProps) {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
      if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openIndex, images.length]);

  if (images.length === 0) return null;

  return (
    <>
      <h2 className="mt-6 text-xl font-bold tracking-tight text-ink">{t("detail.gallery")}</h2>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {images.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-alt"
          >
            <img
              src={getImageUrl(image, 900, 675)}
              srcSet={getImageSrcSet(image, THUMB_WIDTHS, THUMB_ASPECT)}
              sizes="(min-width: 768px) 300px, 50vw"
              alt={alt}
              loading="lazy"
              onError={(e) => {
                if (e.currentTarget.src !== image.url) {
                  e.currentTarget.srcset = "";
                  e.currentTarget.src = image.url;
                }
              }}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label={t("detail.galleryClose")}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
            }}
            aria-label={t("detail.galleryPrev")}
            className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white"
          >
            ‹
          </button>
          <img
            src={getImageUrl(images[openIndex]!, 2000, 1333)}
            srcSet={getImageSrcSet(images[openIndex]!, LIGHTBOX_WIDTHS, LIGHTBOX_ASPECT)}
            sizes="100vw"
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              const original = images[openIndex!]!.url;
              if (e.currentTarget.src !== original) {
                e.currentTarget.srcset = "";
                e.currentTarget.src = original;
              }
            }}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
            }}
            aria-label={t("detail.galleryNext")}
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}

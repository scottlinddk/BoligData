import { useEffect, useState } from "react";
import type { ListingImage } from "@shared/types/index";
import { getImageUrl } from "@shared/utils/image";
import { useI18n } from "@/i18n/i18n";

interface PropertyGalleryProps {
  images: ListingImage[];
  alt: string;
}

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
      <h2 className="mt-6 font-serif text-xl italic text-ink">{t("detail.gallery")}</h2>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {images.map((image, i) => (
          <button
            key={image.url}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="aspect-[7/5] overflow-hidden rounded-xl border border-border bg-surface-alt"
          >
            <img src={getImageUrl(image, 700, 500)} alt={alt} loading="lazy" className="h-full w-full object-cover" />
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
            src={getImageUrl(images[openIndex]!, 1440, 960)}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
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

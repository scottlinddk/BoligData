import type { ListingImage, ListingImageSource } from "../types/index.js";

function availableSources(image: ListingImage): ListingImageSource[] {
  return image.sources;
}

interface ImageVariant {
  url: string;
  /** Pixel width the URL actually resolves to — the `w` descriptor in a srcset. */
  width: number;
}

/**
 * Prefer the smallest available variant that covers the requested box.
 * If the source cannot supply that resolution, use its largest image;
 * never invent a CDN size or claim upscaled pixels in a srcset descriptor.
 */
function pickVariant(image: ListingImage, targetWidth: number, targetHeight: number): ImageVariant {
  const sources = availableSources(image);
  const covering = [...sources]
    .filter((s) => s.width >= targetWidth && s.height >= targetHeight)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (covering) return { url: covering.url, width: covering.width };

  const largest = [...sources].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (largest) return { url: largest.url, width: largest.width };

  return { url: image.url, width: targetWidth };
}

/**
 * Picks a source-provided variant. Images without variant metadata keep their original URL.
 */
export function getImageUrl(image: ListingImage, targetWidth: number, targetHeight: number): string {
  return pickVariant(image, targetWidth, targetHeight).url;
}

/**
 * Builds a `srcSet` across the given widths so the browser can account for
 * device pixel ratio and the real layout width — a fixed `src` sized for a
 * CSS box is half or a third of the pixels a phone actually needs.
 *
 * Returns `undefined` when the image only ever resolves to one URL, because a single-candidate srcset just adds noise; callers
 * still render `src` in that case. `aspectRatio` is width ÷ height.
 */
export function getImageSrcSet(image: ListingImage, widths: number[], aspectRatio: number): string | undefined {
  const byWidth = new Map<number, string>();
  for (const width of widths) {
    const variant = pickVariant(image, width, Math.round(width / aspectRatio));
    if (!byWidth.has(variant.width)) byWidth.set(variant.width, variant.url);
  }

  const seenUrls = new Set(byWidth.values());
  if (seenUrls.size < 2) return undefined;

  return [...byWidth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([width, url]) => `${url} ${width}w`)
    .join(", ");
}

export function getPhotos(images: ListingImage[]): ListingImage[] {
  return images.filter((img) => img.category !== "floorplan");
}

export function getFloorplan(images: ListingImage[]): ListingImage | undefined {
  return images.find((img) => img.category === "floorplan");
}

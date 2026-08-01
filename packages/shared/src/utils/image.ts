import type { ListingImage } from "../types/index.js";

/**
 * Boligsiden's image CDN encodes the rendered size as a `/WxH/` path
 * segment (e.g. .../case/<id>/100x80/<img>.webp) and serves the same image
 * at other sizes when that segment is rewritten. Live-crawled listings
 * carry only the default (tiny) thumbnail URL with no sized `sources`, so
 * rewriting the segment is how we get a sharp image out of them. Components
 * should keep `image.url` as an onError fallback in case a particular size
 * is ever refused.
 */
const BOLIGSIDEN_SIZE_SEGMENT = /\/\d{2,4}x\d{2,4}\//;

function resizeBoligsidenUrl(url: string, width: number, height: number): string | null {
  if (!url.includes("images.boligsiden.dk") || !BOLIGSIDEN_SIZE_SEGMENT.test(url)) return null;
  return url.replace(BOLIGSIDEN_SIZE_SEGMENT, `/${width}x${height}/`);
}

interface ImageVariant {
  url: string;
  /** Pixel width the URL actually resolves to — the `w` descriptor in a srcset. */
  width: number;
}

/**
 * Resolves one variant for a target box, never knowingly returning something
 * smaller than asked for: the smallest pre-sized source that *covers* the box
 * wins, then a CDN rewrite to the exact size, then the largest source we have.
 *
 * Picking by closest area (what this used to do) would happily hand back a
 * 100x80 thumbnail for a 600x400 box, which is what made cards look soft.
 */
function pickVariant(image: ListingImage, targetWidth: number, targetHeight: number): ImageVariant {
  const covering = [...image.sources]
    .filter((s) => s.width >= targetWidth && s.height >= targetHeight)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (covering) return { url: covering.url, width: covering.width };

  const rewritten = resizeBoligsidenUrl(image.url, targetWidth, targetHeight);
  if (rewritten) return { url: rewritten, width: targetWidth };

  const largest = [...image.sources].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (largest) return { url: largest.url, width: largest.width };

  return { url: image.url, width: targetWidth };
}

/**
 * Picks the best-matching variant for a target width/height. Falls back to
 * rewriting Boligsiden CDN URLs to the target size, or the original `url`
 * when neither is available (e.g. Boliga listings).
 */
export function getImageUrl(image: ListingImage, targetWidth: number, targetHeight: number): string {
  return pickVariant(image, targetWidth, targetHeight).url;
}

/**
 * Builds a `srcSet` across the given widths so the browser can account for
 * device pixel ratio and the real layout width — a fixed `src` sized for a
 * CSS box is half or a third of the pixels a phone actually needs.
 *
 * Returns `undefined` when the image only ever resolves to one URL (a Boliga
 * listing, say), because a single-candidate srcset just adds noise; callers
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

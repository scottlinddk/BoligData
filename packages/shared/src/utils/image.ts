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

/**
 * Picks the best-matching pre-sized variant for a target width/height.
 * Falls back to rewriting Boligsiden CDN URLs to the target size, or the
 * original `url` when neither is available (e.g. Boliga listings).
 */
export function getImageUrl(image: ListingImage, targetWidth: number, targetHeight: number): string {
  if (image.sources.length === 0) {
    return resizeBoligsidenUrl(image.url, targetWidth, targetHeight) ?? image.url;
  }

  const exact = image.sources.find((s) => s.width === targetWidth && s.height === targetHeight);
  if (exact) return exact.url;

  const targetArea = targetWidth * targetHeight;
  const closest = [...image.sources].sort(
    (a, b) => Math.abs(a.width * a.height - targetArea) - Math.abs(b.width * b.height - targetArea),
  )[0]!;
  return closest.url;
}

export function getPhotos(images: ListingImage[]): ListingImage[] {
  return images.filter((img) => img.category !== "floorplan");
}

export function getFloorplan(images: ListingImage[]): ListingImage | undefined {
  return images.find((img) => img.category === "floorplan");
}

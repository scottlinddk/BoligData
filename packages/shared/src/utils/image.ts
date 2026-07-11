import type { ListingImage } from "../types/index.js";

/**
 * Picks the best-matching pre-sized variant for a target width/height.
 * Falls back to the source's closest area match, or the original `url`
 * when no sized `sources` are available at all (e.g. Boliga listings).
 */
export function getImageUrl(image: ListingImage, targetWidth: number, targetHeight: number): string {
  if (image.sources.length === 0) return image.url;

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

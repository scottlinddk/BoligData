/**
 * A failed srcset candidate can differ from `src`. Always disable srcset
 * before retrying the original, even when `src` already equals that URL.
 * Attribute comparison also avoids looping on relative/normalized URLs.
 */
export function fallbackToOriginalImage(image: HTMLImageElement, originalUrl: string): void {
  if (!image.srcset && image.getAttribute("src") === originalUrl) return;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.setAttribute("src", originalUrl);
}

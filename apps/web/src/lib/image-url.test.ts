import { describe, expect, it } from "vitest";
import { getImageSrcSet, getImageUrl } from "@shared/utils/image";
import type { ListingImage } from "@shared/types/index";

function img(url: string, sources: ListingImage["sources"] = []): ListingImage {
  return { url, category: "photo", sources };
}

describe("getImageUrl", () => {
  it("returns the original URL when no sources exist", () => {
    const image = img("https://images.example.com/500x/12345.jpg");
    expect(getImageUrl(image, 600, 400)).toBe("https://images.example.com/500x/12345.jpg");
  });

  it("prefers an exact pre-sized source over URL rewriting", () => {
    const image = img("https://images.example.com/photos/x/100x80/y.webp", [
      { url: "https://images.example.com/photos/x/600x400/y.webp", width: 600, height: 400 },
    ]);
    expect(getImageUrl(image, 600, 400)).toBe(
      "https://images.example.com/photos/x/600x400/y.webp",
    );
  });

  it("falls back to the largest source when none covers the target", () => {
    const image = img("https://example.com/a.jpg", [
      { url: "https://example.com/small.jpg", width: 100, height: 80 },
      { url: "https://example.com/big.jpg", width: 1400, height: 900 },
    ]);
    expect(getImageUrl(image, 1440, 960)).toBe("https://example.com/big.jpg");
  });

  it("prefers the smallest covering source over a smaller near-area one", () => {
    const image = img("https://example.com/a.jpg", [
      { url: "https://example.com/thumb.jpg", width: 100, height: 80 },
      { url: "https://example.com/medium.jpg", width: 800, height: 600 },
      { url: "https://example.com/huge.jpg", width: 2400, height: 1800 },
    ]);
    expect(getImageUrl(image, 600, 400)).toBe("https://example.com/medium.jpg");
  });

  it("uses the largest provided source rather than inventing unsupported CDN sizes", () => {
    const image = img("https://images.example.com/photos/x/100x80/y.webp", [
      { url: "https://images.example.com/photos/x/1440x960/y.webp", width: 1440, height: 960 },
    ]);
    expect(getImageUrl(image, 2000, 1333)).toBe(
      "https://images.example.com/photos/x/1440x960/y.webp",
    );
  });

});

describe("getImageSrcSet", () => {
  it("describes each candidate by the width it actually resolves to", () => {
    const image = img("https://example.com/a.jpg", [
      { url: "https://example.com/500.jpg", width: 500, height: 250 },
      { url: "https://example.com/1000.jpg", width: 1000, height: 500 },
    ]);
    expect(getImageSrcSet(image, [400, 800], 2)).toBe(
      "https://example.com/500.jpg 500w, https://example.com/1000.jpg 1000w",
    );
  });

  it("returns undefined when the image only ever resolves to one URL", () => {
    expect(getImageSrcSet(img("https://images.example.com/500x/12345.jpg"), [400, 800], 2)).toBeUndefined();
  });
});

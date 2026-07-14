import { describe, expect, it } from "vitest";
import { getImageUrl } from "@shared/utils/image";
import type { ListingImage } from "@shared/types/index";

function img(url: string, sources: ListingImage["sources"] = []): ListingImage {
  return { url, category: "photo", sources };
}

describe("getImageUrl", () => {
  it("rewrites the size segment of a Boligsiden CDN URL when no sources exist", () => {
    const image = img(
      "https://images.boligsiden.dk/images/case/113ce067/100x80/393ea4e7.webp",
    );
    expect(getImageUrl(image, 600, 400)).toBe(
      "https://images.boligsiden.dk/images/case/113ce067/600x400/393ea4e7.webp",
    );
  });

  it("leaves non-Boligsiden URLs untouched when no sources exist", () => {
    const image = img("https://i.boliga.org/dk/500x/12345.jpg");
    expect(getImageUrl(image, 600, 400)).toBe("https://i.boliga.org/dk/500x/12345.jpg");
  });

  it("leaves Boligsiden URLs without a size segment untouched", () => {
    const image = img("https://images.boligsiden.dk/images/case/113ce067/original.webp");
    expect(getImageUrl(image, 600, 400)).toBe(
      "https://images.boligsiden.dk/images/case/113ce067/original.webp",
    );
  });

  it("prefers an exact pre-sized source over URL rewriting", () => {
    const image = img("https://images.boligsiden.dk/images/case/x/100x80/y.webp", [
      { url: "https://images.boligsiden.dk/images/case/x/600x400/y.webp", width: 600, height: 400 },
    ]);
    expect(getImageUrl(image, 600, 400)).toBe(
      "https://images.boligsiden.dk/images/case/x/600x400/y.webp",
    );
  });

  it("picks the closest-area source when no exact match exists", () => {
    const image = img("https://example.com/a.jpg", [
      { url: "https://example.com/small.jpg", width: 100, height: 80 },
      { url: "https://example.com/big.jpg", width: 1400, height: 900 },
    ]);
    expect(getImageUrl(image, 1440, 960)).toBe("https://example.com/big.jpg");
  });
});

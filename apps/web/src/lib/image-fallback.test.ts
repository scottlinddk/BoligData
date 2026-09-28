import { describe, expect, it, vi } from "vitest";
import { fallbackToOriginalImage } from "./image-fallback";

function imageElement(src: string, srcset = "") {
  const attrs = new Map([["src", src], ["srcset", srcset], ["sizes", "100vw"]]);
  return {
    get srcset() { return attrs.get("srcset") ?? ""; },
    getAttribute: (name: string) => attrs.get(name) ?? null,
    removeAttribute: vi.fn((name: string) => { attrs.delete(name); }),
    setAttribute: vi.fn((name: string, value: string) => { attrs.set(name, value); }),
  };
}

describe("listing image error fallback", () => {
  it("retries the original after a failed responsive candidate even when src already matches", () => {
    const element = imageElement("/original.jpg", "/large.jpg 1440w");
    fallbackToOriginalImage(element as unknown as HTMLImageElement, "/original.jpg");
    expect(element.srcset).toBe("");
    expect(element.getAttribute("sizes")).toBeNull();
    expect(element.setAttribute).toHaveBeenCalledWith("src", "/original.jpg");
    // A missing original must not trigger an endless error/retry loop.
    fallbackToOriginalImage(element as unknown as HTMLImageElement, "/original.jpg");
    expect(element.setAttribute).toHaveBeenCalledTimes(1);
  });

  it("falls back from a failed fullscreen image without srcset", () => {
    const element = imageElement("https://example.com/large.jpg");
    fallbackToOriginalImage(element as unknown as HTMLImageElement, "https://example.com/original.jpg");
    expect(element.getAttribute("src")).toBe("https://example.com/original.jpg");
  });
});

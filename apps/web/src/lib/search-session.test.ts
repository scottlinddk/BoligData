import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_PREFS, pageToOffset, parseViewPrefs } from "./search-session";

describe("search-session", () => {
  it("falls back to defaults for missing or corrupt view prefs", () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_VIEW_PREFS);
    expect(parseViewPrefs("not json")).toEqual(DEFAULT_VIEW_PREFS);
  });

  it("accepts valid prefs and rejects unknown page sizes", () => {
    expect(parseViewPrefs(JSON.stringify({ pageSize: 25, desktopMap: false, mobileTab: "map" }))).toEqual({ pageSize: 25, desktopMap: false, mobileTab: "map" });
    expect(parseViewPrefs(JSON.stringify({ pageSize: 7 })).pageSize).toBe(DEFAULT_VIEW_PREFS.pageSize);
  });

  it("converts a 1-based page param to an offset and ignores bad input", () => {
    expect(pageToOffset("3", 25)).toBe(50);
    expect(pageToOffset("1", 25)).toBe(0);
    expect(pageToOffset(null, 25)).toBe(0);
    expect(pageToOffset("-2", 25)).toBe(0);
    expect(pageToOffset("abc", 25)).toBe(0);
  });
});

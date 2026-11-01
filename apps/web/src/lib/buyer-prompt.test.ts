import { describe, expect, it } from "vitest";
import { buildBuyerPrompt, cleanCount, EXAMPLE_INPUT, normalizeInput, zipOf } from "@/lib/buyer-prompt";

const TODAY = new Date(Date.UTC(2026, 10, 1)); // 1 November 2026

describe("buildBuyerPrompt for the example search", () => {
  const da = buildBuyerPrompt(EXAMPLE_INPUT, "da", TODAY);
  const en = buildBuyerPrompt(EXAMPLE_INPUT, "en", TODAY);

  it("carries every requirement", () => {
    for (const text of [da, en]) {
      expect(text).toContain("boligsiden.dk");
      expect(text).toContain("9000 Aalborg");
      expect(text).toContain("4-5");
      expect(text).toContain("130");
    }
    expect(da).toContain("mindst 2");
    expect(en).toContain("at least 2");
  });

  it("includes the postcode 9000 figures from the stats page", () => {
    expect(da).toContain("27.690 kr./m²");
    expect(da).toContain("150 dage");
    expect(en).toContain("27,690 DKK/m²");
    expect(en).toContain("150");
  });

  it("states the season and which month it is now", () => {
    expect(da).toContain("november til marts");
    expect(da).toContain("Nu er det november");
    expect(da).toContain("høj forhandlingsstyrke og normalt udbud");
    expect(en).toContain("It is now November");
  });

  it("asks for sources, a ranking and a bid, and forbids invention", () => {
    expect(da).toContain("5 bedste");
    expect(da).toContain("åbningsbud");
    expect(da).toContain("Opfind ingen");
    expect(en).toContain("Do not invent");
    expect(en).toContain("opening bid");
  });
});

describe("buildBuyerPrompt outside postcode 9000", () => {
  const text = buildBuyerPrompt({ ...EXAMPLE_INPUT, location: "8000 Aarhus C" }, "en", TODAY);

  it("does not present the 9000 figures as the area's", () => {
    expect(text).not.toContain("27,690");
    expect(text).not.toContain("Market data for postcode 9000");
    expect(text).toContain("I have no market figures for 8000 Aarhus C");
    expect(text).toContain("Do not use figures from other postcodes");
  });

  it("applies the same rule when no postcode is given", () => {
    expect(buildBuyerPrompt({ ...EXAMPLE_INPUT, location: "Aalborg" }, "da", TODAY)).not.toContain("27.690");
  });
});

describe("input handling", () => {
  it("parses the postcode from the start of the location", () => {
    expect(zipOf("9000 Aalborg")).toBe("9000");
    expect(zipOf(" 8000")).toBe("8000");
    expect(zipOf("Aalborg 9000")).toBeNull();
    expect(zipOf("90000")).toBeNull();
  });

  it("drops invalid numbers and swaps a reversed room range", () => {
    expect(cleanCount(Number.NaN)).toBeNull();
    expect(cleanCount(-3)).toBeNull();
    expect(cleanCount(4.6)).toBe(5);
    expect(normalizeInput({ ...EXAMPLE_INPUT, roomsMin: 5, roomsMax: 4 })).toMatchObject({ roomsMin: 4, roomsMax: 5 });
  });

  it("leaves out criteria that are blank instead of printing placeholders", () => {
    const text = buildBuyerPrompt({ source: "boligsiden.dk", location: "9000 Aalborg", roomsMin: null, roomsMax: null, bathroomsMin: null, minAreaM2: null }, "en", TODAY);
    expect(text).not.toMatch(/Rooms:|Bathrooms\/toilets:|Living area:/);
  });

  it("says so when a single room count is given", () => {
    expect(buildBuyerPrompt({ ...EXAMPLE_INPUT, roomsMin: 4, roomsMax: 4 }, "en", TODAY)).toContain("- Rooms: 4 rooms");
    expect(buildBuyerPrompt({ ...EXAMPLE_INPUT, roomsMin: 4, roomsMax: null }, "en", TODAY)).toContain("at least 4 rooms");
  });
});

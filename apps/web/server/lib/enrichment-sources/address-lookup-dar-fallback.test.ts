import { describe, expect, it } from "vitest";
import { parseStructuredAddress } from "./address-lookup-dar-fallback.js";

describe("parseStructuredAddress", () => {
  it("splits a free-text address into street, house number and postal code", () => {
    expect(parseStructuredAddress("Hobrovej 123, 9000 Aalborg", null)).toEqual({
      streetName: "Hobrovej",
      houseNumber: "123",
      postalCode: "9000",
    });
  });

  it("accepts a letter suffix on the house number", () => {
    expect(parseStructuredAddress("Floravej 6a", "9000")).toEqual({
      streetName: "Floravej",
      houseNumber: "6a",
      postalCode: "9000",
    });
  });

  it("prefers the explicit postal code hint over one parsed from the text", () => {
    expect(parseStructuredAddress("Hobrovej 123, 9000 Aalborg", "9100")?.postalCode).toBe("9100");
  });

  it("drops a floor/door suffix, keying only off the street entrance", () => {
    expect(parseStructuredAddress("Hobrovej 123, 2. tv, 9000 Aalborg", null)).toEqual({
      streetName: "Hobrovej",
      houseNumber: "123",
      postalCode: "9000",
    });
  });

  it("normalises a spaced or plus-joined letter suffix to the glued form DAR uses", () => {
    expect(parseStructuredAddress("Lundagervej 10+B", "9330")?.houseNumber).toBe("10B");
    expect(parseStructuredAddress("Lundagervej 10 B", "9330")).toEqual({ streetName: "Lundagervej", houseNumber: "10B", postalCode: "9330" });
  });

  it("returns null when the text has no house-number-shaped token", () => {
    expect(parseStructuredAddress("ikke en adresse", null)).toBeNull();
    expect(parseStructuredAddress("", null)).toBeNull();
  });
});

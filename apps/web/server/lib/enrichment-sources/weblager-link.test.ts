import { describe, expect, it } from "vitest";
import { buildWeblagerUrl } from "./weblager-link.js";

describe("buildWeblagerUrl", () => {
  it("links to the Aalborg search page without an addressId", () => {
    expect(buildWeblagerUrl("Aalborg")).toBe("https://weblager.dk/public/municipality/851/45/search/all");
  });

  it("returns null for municipalities that are not verified", () => {
    expect(buildWeblagerUrl("Odense")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(buildWeblagerUrl("")).toBeNull();
  });

  it("does not match different casing or inherited object keys", () => {
    expect(buildWeblagerUrl("aalborg")).toBeNull();
    expect(buildWeblagerUrl("constructor")).toBeNull();
  });
});

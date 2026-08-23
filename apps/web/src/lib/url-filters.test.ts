import { describe, expect, it } from "vitest";
import { defaultFilters, parseFilters, serializeFilters } from "./url-filters";

describe("url-filters", () => {
  it("round-trips filters through serialize/parse", () => {
    const filters = {
      ...defaultFilters(),
      location: "Aalborg",
      minPrice: 1000000,
      maxPrice: 3000000,
      sortField: "price" as const,
      sortDirection: "asc" as const,
    };

    const params = serializeFilters(filters);
    const parsed = parseFilters(params);

    expect(parsed).toEqual(filters);
  });

  it("treats missing params as defaults", () => {
    const parsed = parseFilters(new URLSearchParams());
    expect(parsed).toEqual(defaultFilters());
  });

  it("ignores empty-string values on serialize", () => {
    const params = serializeFilters({ location: "" });
    expect(params.has("location")).toBe(false);
  });

  it("round-trips propertyTypes as a comma-separated list", () => {
    const filters = { ...defaultFilters(), propertyTypes: ["villa", "cooperative"] as ("villa" | "cooperative")[] };
    const params = serializeFilters(filters);
    expect(params.get("propertyTypes")).toBe("villa,cooperative");
    expect(parseFilters(params)).toEqual(filters);
  });

  it("ignores an empty propertyTypes array on serialize", () => {
    const params = serializeFilters({ propertyTypes: [] });
    expect(params.has("propertyTypes")).toBe(false);
  });

  it("drops unknown propertyTypes values on parse", () => {
    const params = new URLSearchParams({ propertyTypes: "villa,not-a-real-type" });
    expect(parseFilters(params).propertyTypes).toEqual(["villa"]);
  });
});

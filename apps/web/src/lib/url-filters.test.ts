import { describe, expect, it } from "vitest";
import { defaultFilters, parseFilters, serializeFilters } from "./url-filters";
import { serializeSearchBoundary } from "@shared/utils/search-boundary";

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

  it("keeps a canonical drawn area through URL and saved-filter round trips", () => {
    const polygon = serializeSearchBoundary([[9, 57], [10, 57], [10, 58], [9, 58]]);
    const filters = { ...defaultFilters(), polygon, location: "Aalborg", minPrice: 1_000_000 };
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
    expect(serializeFilters(filters).get("polygon")).toBe(polygon);
    expect(parseFilters(new URLSearchParams({ polygon: "[[10,58],[10,57],[9,57],[9,58],[10,58]]" })).polygon).toBe(polygon);
  });

  it("preserves invalid provided boundaries for an API error rather than an unrestricted search", () => {
    for (const polygon of ["invalid-json", "", "[[1,1],[2,2],[3,3]]"]) {
      const parsed = parseFilters(new URLSearchParams({ polygon }));
      expect(parsed.polygon).toBe(polygon);
      expect(serializeFilters(parsed).get("polygon")).toBe(polygon);
    }
    expect(serializeFilters({ polygon: null }).has("polygon")).toBe(false);
  });
});

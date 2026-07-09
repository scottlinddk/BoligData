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
});

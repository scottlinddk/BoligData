import { describe, expect, it } from "vitest";
import { mapStatPoint } from "./boligsiden-stats.js";

describe("mapStatPoint", () => {
  it("maps a live Markedsindeks point", () => {
    expect(
      mapStatPoint(
        {
          addressType: "villa",
          from: "2025-10-01",
          to: "2025-10-31",
          locationName: "Aalborg",
          locationType: "municipality",
          type: "sold_per_area_price",
          value: 15621,
          previousMonth: { value: 15287 },
          previousYear: { value: 16169 },
        },
        "villa",
      ),
    ).toMatchObject({ location_name: "Aalborg", stat_type: "sold_per_area_price", value: 15621, prev_year_value: 16169 });
  });

  it("rejects unknown stat types and missing values", () => {
    expect(mapStatPoint({ type: "nope", locationName: "x", from: "a", to: "b", value: 1 }, "villa")).toBeNull();
    expect(mapStatPoint({ type: "sold_time_on_market", locationName: "x", from: "a", to: "b" }, "villa")).toBeNull();
  });
});

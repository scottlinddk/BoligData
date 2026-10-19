import { describe, expect, it } from "vitest";
import { etrs89Utm32ToWgs84 } from "./etrs89-utm32.js";

describe("etrs89Utm32ToWgs84", () => {
  it("reproduces the register's own WGS84 coordinates for a real address", () => {
    // Floravej 6, 9000 Aalborg. UTM from Adressevælger's `adgangspunkt.koordinater`
    // (2026-10-17), WGS84 from the DAWA record the address-lookup tests pin.
    const point = etrs89Utm32ToWgs84(553173.08, 6322838.76);
    expect(point?.lat).toBeCloseTo(57.04591973, 7);
    expect(point?.lon).toBeCloseTo(9.87640126, 7);
  });

  it("puts the central meridian at 9°E and the false northing origin on the equator", () => {
    expect(etrs89Utm32ToWgs84(500_000, 6_200_000)?.lon).toBeCloseTo(9, 9);
    expect(etrs89Utm32ToWgs84(500_000, 0)?.lat).toBeCloseTo(0, 9);
  });

  it("moves east of the meridian as easting grows and north as northing grows", () => {
    const base = etrs89Utm32ToWgs84(553_173, 6_322_838)!;
    expect(etrs89Utm32ToWgs84(553_273, 6_322_838)!.lon).toBeGreaterThan(base.lon);
    expect(etrs89Utm32ToWgs84(553_173, 6_322_938)!.lat).toBeGreaterThan(base.lat);
  });

  it("returns null instead of NaN for unusable input", () => {
    expect(etrs89Utm32ToWgs84(Number.NaN, 6_322_838)).toBeNull();
    expect(etrs89Utm32ToWgs84(553_173, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

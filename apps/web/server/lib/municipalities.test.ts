import { describe, expect, it } from "vitest";
import { KNOWN_MUNICIPALITY_NAMES, municipalityNameFromCode } from "./municipalities.js";
import { buildSpildevandsplanUrl } from "./enrichment-sources/spildevandsplan.js";
import { buildWeblagerUrl } from "./enrichment-sources/weblager-link.js";

describe("municipalityNameFromCode", () => {
  it("reads the register's four-digit code, a bare three-digit code and a number alike", () => {
    expect(municipalityNameFromCode("0851")).toBe("Aalborg");
    expect(municipalityNameFromCode("851")).toBe("Aalborg");
    expect(municipalityNameFromCode(851)).toBe("Aalborg");
    expect(municipalityNameFromCode(" 0860 ")).toBe("Hjørring");
  });

  it("names the municipality the register reported for real addresses (checked 2026-10-17)", () => {
    const checked: Array<[string, string]> = [
      ["0773", "Morsø"], ["0787", "Thisted"], ["0810", "Brønderslev"], ["0813", "Frederikshavn"], ["0820", "Vesthimmerland"],
      ["0825", "Læsø"], ["0840", "Rebild"], ["0846", "Mariagerfjord"], ["0849", "Jammerbugt"], ["0851", "Aalborg"], ["0860", "Hjørring"],
    ];
    for (const [code, name] of checked) expect(municipalityNameFromCode(code)).toBe(name);
  });

  it("returns null for a municipality the link builders do not cover, rather than guessing", () => {
    expect(municipalityNameFromCode("0101")).toBeNull(); // København
    expect(municipalityNameFromCode("0000")).toBeNull();
  });

  it("returns null for anything that is not a code", () => {
    for (const bad of [null, undefined, "", "Aalborg", "08 51", "08510", "12", "851a", "constructor", "__proto__"]) {
      expect(municipalityNameFromCode(bad as string | null)).toBeNull();
    }
  });

  it("only names municipalities whose spildevandsplan link the builder knows, so the two tables cannot drift apart", () => {
    for (const name of KNOWN_MUNICIPALITY_NAMES) expect(buildSpildevandsplanUrl(name), name).not.toBeNull();
    expect(buildWeblagerUrl("Aalborg")).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildJordforureningsattestUrl } from "./jordforureningsattest-link.js";

describe("buildJordforureningsattestUrl", () => {
  it("builds the jord.miljoeportal.dk report link from ejerlavskode and matrikelnr", () => {
    const url = buildJordforureningsattestUrl("620551", "9h");
    expect(url).toBe("https://jord.miljoeportal.dk/report/?elav=620551&matrnr=9h");
  });

  it("returns null without an ejerlavskode", () => {
    expect(buildJordforureningsattestUrl(null, "9h")).toBeNull();
  });

  it("returns null without a matrikelnr", () => {
    expect(buildJordforureningsattestUrl("620551", null)).toBeNull();
  });
});

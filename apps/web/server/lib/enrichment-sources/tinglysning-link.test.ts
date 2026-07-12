import { describe, expect, it } from "vitest";
import { buildTinglysningUrl } from "./tinglysning-link.js";

describe("buildTinglysningUrl", () => {
  it("builds a search URL when both matrikelnr and ejerlav are present", () => {
    const url = buildTinglysningUrl("12a", "Testby Ejerlav");
    expect(url).toContain("tinglysning.dk");
    expect(url).toContain("matrikelnummer=12a");
    expect(url).toContain(encodeURIComponent("Testby Ejerlav").replace(/%20/g, "+"));
  });

  it("returns null when matrikelnr is missing", () => {
    expect(buildTinglysningUrl(null, "Testby Ejerlav")).toBeNull();
  });

  it("returns null when ejerlav is missing", () => {
    expect(buildTinglysningUrl("12a", null)).toBeNull();
  });
});

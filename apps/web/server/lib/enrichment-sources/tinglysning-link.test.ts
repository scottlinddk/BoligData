import { describe, expect, it } from "vitest";
import { buildTinglysningUrl } from "./tinglysning-link.js";

describe("buildTinglysningUrl", () => {
  it("links to the real tinglysning.dk site when both matrikelnr and ejerlav are present", () => {
    const url = buildTinglysningUrl("12a", "Testby Ejerlav");
    expect(url).toBe("https://www.tinglysning.dk/");
  });

  it("returns null when matrikelnr is missing", () => {
    expect(buildTinglysningUrl(null, "Testby Ejerlav")).toBeNull();
  });

  it("returns null when ejerlav is missing", () => {
    expect(buildTinglysningUrl("12a", null)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildSpildevandsplanUrl } from "./spildevandsplan.js";

describe("buildSpildevandsplanUrl", () => {
  it("returns a URL for a municipality within the crawl's postal-code scope", () => {
    expect(buildSpildevandsplanUrl("Aalborg")).toBe("https://www.aalborg.dk/");
  });

  it("returns null for a municipality outside the lookup table", () => {
    expect(buildSpildevandsplanUrl("København")).toBeNull();
  });
});

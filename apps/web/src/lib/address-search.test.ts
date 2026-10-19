import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSearchUrl, isHusnummerId, normalizeQuery, parseSuggestions, searchAddresses } from "./address-search";

const FLORAVEJ_AALBORG = "0a3f509c-38ed-32b8-e044-0003ba298018";

/** Shaped like the live `GET /husnumre/soeg?tekst=Floravej 6` answer (2026-10-17). */
const addressHits = {
  status: "ok",
  beskrivelse: "",
  fund: [
    { type: "husnummer", id: "0a3f5080-ce17-32b8-e044-0003ba298018", titel: "Floravej 6, 3660 Stenløse", vejnavn: "Floravej", husnummer: "6" },
    { type: "husnummer", id: FLORAVEJ_AALBORG, titel: "Floravej 6, 9000 Aalborg", vejnavn: "Floravej", husnummer: "6" },
  ],
};

/** The "not specific enough" answer for a bare street name. */
const streetHits = {
  status: "ok",
  fund: [
    { type: "vejnavn", titel: "Floradalen", vejNavn: "Floradalen" },
    { type: "navngivenvejpostnummer", id: "f446c0a9-e61b-4165-ba93-532144eca80d", titel: "Floravej, 9000 Aalborg" },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("normalizeQuery", () => {
  it("collapses whitespace and caps the length the API accepts", () => {
    expect(normalizeQuery("  Floravej   6 \n Aalborg ")).toBe("Floravej 6 Aalborg");
    expect(normalizeQuery("x".repeat(200))).toHaveLength(73);
  });
});

describe("buildSearchUrl", () => {
  it("encodes the text, limits results and carries the published token", () => {
    const url = new URL(buildSearchUrl("Rønnebærvej 1 & co"));
    expect(url.origin + url.pathname).toBe("https://adressevaelger.dk/husnumre/soeg");
    expect(url.searchParams.get("tekst")).toBe("Rønnebærvej 1 & co");
    expect(url.searchParams.get("maksimum")).toBe("8");
    expect(url.searchParams.get("token")).toBe("adressevaelger123");
  });
});

describe("parseSuggestions", () => {
  it("returns complete house numbers as selectable addresses with their DAR id", () => {
    expect(parseSuggestions(addressHits)).toEqual([
      { kind: "address", label: "Floravej 6, 3660 Stenløse", id: "0a3f5080-ce17-32b8-e044-0003ba298018" },
      { kind: "address", label: "Floravej 6, 9000 Aalborg", id: FLORAVEJ_AALBORG },
    ]);
  });

  it("never offers a street-level hit as a final answer, even when it carries an id", () => {
    const parsed = parseSuggestions(streetHits);
    expect(parsed.map((s) => s.kind)).toEqual(["refine", "refine"]);
    expect(parsed.every((s) => s.id === null)).toBe(true);
  });

  it("rejects a husnummer hit whose id is not a UUID", () => {
    expect(parseSuggestions({ fund: [{ type: "husnummer", id: "../../x", titel: "Bad 1" }] })).toEqual([
      { kind: "refine", label: "Bad 1", id: null },
    ]);
  });

  it("drops hits without a title, removes duplicates and caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: "husnummer",
      id: `0a3f5080-ce17-32b8-e044-${String(i).padStart(12, "0")}`,
      titel: `Vej ${i}`,
    }));
    const hits = [{ type: "husnummer", id: FLORAVEJ_AALBORG }, ...many, many[0], many[0]];
    const parsed = parseSuggestions({ fund: hits });
    expect(parsed).toHaveLength(8);
    expect(new Set(parsed.map((s) => s.id)).size).toBe(8);
  });

  it("is empty for anything that is not a result list", () => {
    for (const body of [null, undefined, "x", [], {}, { fund: "no" }]) expect(parseSuggestions(body)).toEqual([]);
  });
});

describe("isHusnummerId", () => {
  it("accepts UUIDs only", () => {
    expect(isHusnummerId(FLORAVEJ_AALBORG)).toBe(true);
    expect(isHusnummerId(`${FLORAVEJ_AALBORG}/x`)).toBe(false);
    expect(isHusnummerId("")).toBe(false);
  });
});

describe("searchAddresses", () => {
  it("makes no request for text shorter than the minimum", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(searchAddresses(" a ")).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes the abort signal through and parses the answer", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(addressHits)));
    const controller = new AbortController();
    const result = await searchAddresses("Floravej 6", controller.signal);
    expect(result).toHaveLength(2);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it("throws on an error status so the UI can say the search is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(searchAddresses("Floravej")).rejects.toThrow("503");
  });
});

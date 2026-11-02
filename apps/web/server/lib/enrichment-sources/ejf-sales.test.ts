import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatafordelerCache, sdlTypeFields } from "./datafordeler.js";
import { buildHandelQuery, buildOwnershipQuery, EJF_ACCESS_MESSAGE, lookupRegisteredSales, mapTrades, resolveEjfFields } from "./ejf-sales.js";

const SDL = `
type EJF_Ejerskifte implements Node {
  "the BFE"
  bestemtFastEjendomBFENr: Long
  anmeldelsesdato: DateTime
  id_lokalId: String
}
type EJF_Handelsoplysninger implements Node {
  """
  multi-line description
  """
  samletKoebesum: Float
  koebsaftaledato: LocalDate
  ejerskifteLokalId: String
  id_lokalId(first: Int): String
}
type Other { x: Int }
`;

const names = (...n: string[]) => new Set(n);

describe("sdlTypeFields", () => {
  it("reads field names, skipping descriptions and arguments", () => {
    expect([...sdlTypeFields(SDL, "EJF_Handelsoplysninger")!].sort()).toEqual(["ejerskifteLokalId", "id_lokalId", "koebsaftaledato", "samletKoebesum"]);
    expect(sdlTypeFields(SDL, "EJF_Ejerskifte")!.has("bestemtFastEjendomBFENr")).toBe(true);
  });
  it("returns null for a type that is not there", () => {
    expect(sdlTypeFields(SDL, "EJF_Nope")).toBeNull();
  });
});

describe("resolveEjfFields", () => {
  const ownership = names("id_lokalId", "bestemtFastEjendomBFENr", "anmeldelsesdato");
  const handel = names("id_lokalId", "koebsaftaledato", "samletKoebesum", "ejerskifteLokalId");

  it("finds the link on the trade details", () => {
    const r = resolveEjfFields(ownership, handel);
    expect(r).toMatchObject({ ok: true, data: { handel: { ownershipLink: "ejerskifteLokalId" } } });
  });
  it("finds the link on the ownership change when the trade details do not point back", () => {
    const r = resolveEjfFields(names(...ownership, "handelsoplysningerLokalId"), names("id_lokalId", "koebsaftaledato", "samletKoebesum"));
    expect(r).toMatchObject({ ok: true, data: { ownership: { handelLink: "handelsoplysningerLokalId" } } });
  });
  it("fails, naming what is missing, rather than guessing a join", () => {
    expect(resolveEjfFields(ownership, names("id_lokalId", "koebsaftaledato", "samletKoebesum"))).toMatchObject({ ok: false, error: expect.stringContaining("no recognisable link") });
    expect(resolveEjfFields(ownership, names("id_lokalId", "samletKoebesum"))).toMatchObject({ ok: false, error: expect.stringContaining("koebsaftaledato") });
  });
});

describe("mapTrades", () => {
  const f = { id: "id_lokalId", date: "koebsaftaledato", price: "samletKoebesum" };
  it("maps, sorts newest first, dedupes a re-registered trade and never claims a sale type", () => {
    const { entries, skipped } = mapTrades(
      [
        { id_lokalId: "a", koebsaftaledato: "2015-06-01", samletKoebesum: 2_000_000 },
        { id_lokalId: "b", koebsaftaledato: "2021-03-15T00:00:00Z", samletKoebesum: 3_100_000 },
        { id_lokalId: "c", koebsaftaledato: "2021-03-15", samletKoebesum: 3_100_000 },
      ],
      f,
    );
    expect(skipped).toBe(0);
    expect(entries.map((e) => [e.soldDate, e.price, e.saleType])).toEqual([["2021-03-15", 3_100_000, "unknown"], ["2015-06-01", 2_000_000, "unknown"]]);
    expect(entries[0]!.registrationId).toBe("ejf:b");
  });
  it("skips trades without a usable date or a positive price, and counts them", () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10);
    const { entries, skipped } = mapTrades(
      [
        { koebsaftaledato: "2020-02-30", samletKoebesum: 1_000_000 }, // not a calendar date
        { koebsaftaledato: future, samletKoebesum: 1_000_000 },
        { koebsaftaledato: "2019-01-01", samletKoebesum: 0 }, // gift
        { koebsaftaledato: null, samletKoebesum: 900_000 },
        { koebsaftaledato: "2019-01-01", samletKoebesum: 950_000 },
      ],
      f,
    );
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(4);
  });
});

describe("query builders", () => {
  const fields = resolveEjfFields(names("id_lokalId", "bestemtFastEjendomBFENr"), names("id_lokalId", "koebsaftaledato", "samletKoebesum", "ejerskifteLokalId"));
  if (!fields.ok) throw new Error("fixture");
  it("filters ownership changes by BFE as a number", () => {
    expect(buildOwnershipQuery(390985, fields.data, "")).toContain("bestemtFastEjendomBFENr: { eq: 390985 }");
  });
  it("quotes ids and keys trades by the link field", () => {
    const q = buildHandelQuery(["x", 'y"z'], "ejerskifteLokalId", fields.data, "");
    expect(q).toContain('ejerskifteLokalId: { in: ["x", "y\\"z"] }');
  });
});

describe("lookupRegisteredSales", () => {
  beforeEach(() => {
    resetDatafordelerCache();
    vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function stub(opts: { temporalRejected?: boolean; ownershipPage?: boolean; status?: number } = {}) {
    const docs: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init?: { body?: unknown }) => {
      const href = String(url);
      if (opts.status) return { ok: false, status: opts.status, headers: new Headers(), text: async () => "no", json: async () => ({}) };
      if (href.includes("/schema")) return { ok: true, status: 200, headers: new Headers(), text: async () => SDL };
      const doc = JSON.parse(String(init?.body)).query as string;
      docs.push(doc);
      if (opts.temporalRejected && doc.includes("registreringstid")) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ errors: [{ message: "the argument `registreringstid` does not exist" }] }) };
      }
      const data = doc.includes("EJF_Ejerskifte(")
        ? { EJF_Ejerskifte: { pageInfo: { hasNextPage: opts.ownershipPage ?? false }, nodes: [{ id_lokalId: "o1", anmeldelsesdato: "2021-04-01" }, { id_lokalId: "o2", anmeldelsesdato: "2015-07-01" }] } }
        : { EJF_Handelsoplysninger: { pageInfo: { hasNextPage: false }, nodes: [
            { id_lokalId: "h1", ejerskifteLokalId: "o1", koebsaftaledato: "2021-03-15", samletKoebesum: 3_100_000 },
            { id_lokalId: "h2", ejerskifteLokalId: "o2", koebsaftaledato: "2015-06-01", samletKoebesum: 2_000_000 },
          ] } };
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data }) };
    }) as unknown as typeof fetch);
    return docs;
  }

  it("reads the sales of a BFE, newest first", async () => {
    const docs = stub();
    const r = await lookupRegisteredSales("390985");
    expect(r).toMatchObject({ ok: true, data: { skipped: 0 } });
    if (r.ok) expect(r.data.entries.map((e) => e.price)).toEqual([3_100_000, 2_000_000]);
    expect(docs[1]).toContain('ejerskifteLokalId: { in: ["o1", "o2"] }');
  });

  it("retries without the bitemporal arguments when the register has none", async () => {
    const docs = stub({ temporalRejected: true });
    expect((await lookupRegisteredSales("390985")).ok).toBe(true);
    expect(docs.some((d) => !d.includes("registreringstid"))).toBe(true);
  });

  it("reports missing access, not 'no sales', on 401/403", async () => {
    stub({ status: 403 });
    expect(await lookupRegisteredSales("390985")).toEqual({ ok: false, error: EJF_ACCESS_MESSAGE });
  });

  it("refuses an incomplete list", async () => {
    stub({ ownershipPage: true });
    expect(await lookupRegisteredSales("390985")).toMatchObject({ ok: false, error: expect.stringContaining("complete list") });
  });

  it("rejects a malformed BFE and a missing key without calling out", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await lookupRegisteredSales("12; drop")).toMatchObject({ ok: false });
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect(await lookupRegisteredSales("390985")).toMatchObject({ ok: false, error: expect.stringContaining("not configured") });
    expect(spy).not.toHaveBeenCalled();
  });
});

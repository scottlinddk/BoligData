import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBbrTanks, mapTank, TANK_CLASSIFICATION } from "./bbr-tanks.js";
import { resetDatafordelerCache } from "./datafordeler.js";

const HUSNUMMER = "0a3f509c-38ed-32b8-e044-0003ba298018";
const BUILDING = "a49ca297-725b-4510-ae12-000000000001";
const GRUND = "b49ca297-725b-4510-ae12-000000000002";
const NOW = Date.UTC(2026, 9, 18);

type Handler = (query: string) => { nodes: unknown[]; hasNextPage?: boolean };

/** A fake Datafordeler: one handler per entity, and a record of every document sent. */
function fakeDatafordeler(handlers: Record<string, Handler>) {
  const queries: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: { body?: unknown }) => {
    const query = JSON.parse(String(init?.body)).query as string;
    queries.push(query);
    const entity = query.match(/query Q \{ (\w+)/)?.[1] ?? "";
    const result = handlers[entity]?.(query) ?? { nodes: [], hasNextPage: false };
    const connection = { nodes: result.nodes, pageInfo: { hasNextPage: result.hasNextPage ?? false } };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [entity]: connection } }) };
  }) as unknown as typeof fetch);
  return { queries };
}

const tank = (extra: Record<string, unknown> = {}) => ({
  id_lokalId: "t1", status: "6", tek020Klassifikation: "1110", tek024Etableringsaar: 1978, tek027Placering: "2",
  tek028SloejfningOlietank: null, tek032Stoerrelse: 1500, tek034IndholdOlietank: "1", tek035SloejfningsfristOlietank: "2028-12-31T00:00:00Z",
  tek067Fabrikationsaar: 1978, tek072Sloejfningsaar: null, tek110Driftstatus: "1", ...extra,
});

const registers = (tanks: Record<string, Handler> = {}): Record<string, Handler> => ({
  BBR_Bygning: () => ({ nodes: [{ id_lokalId: BUILDING }] }),
  BBR_Grund: () => ({ nodes: [{ id_lokalId: GRUND }] }),
  ...tanks,
});

beforeEach(() => {
  resetDatafordelerCache();
  vi.stubEnv("DATAFORDELER_API_KEY", "test-key");
  vi.stubEnv("BBR_MOCK_MODE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mapTank", () => {
  it("maps a standing tank, keeping the deadline as a date and the unread codes raw", () => {
    expect(mapTank(tank(), NOW)).toEqual({
      sizeLiters: 1500, manufacturedYear: 1978, installedYear: 1978, decommissionDeadline: "2028-12-31", decommissionedYear: null,
      decommissioned: false, inOperation: true, placementCode: "2", contentCode: "1",
    });
  });

  it("calls a tank decommissioned from its year, its method code or a status other than built", () => {
    expect(mapTank(tank({ tek072Sloejfningsaar: 2014 }), NOW)).toMatchObject({ decommissioned: true, decommissionedYear: 2014 });
    expect(mapTank(tank({ tek028SloejfningOlietank: "1" }), NOW).decommissioned).toBe(true);
    expect(mapTank(tank({ status: "7" }), NOW).decommissioned).toBe(true);
    expect(mapTank(tank(), NOW).decommissioned).toBe(false);
  });

  it("reads the drift code, and leaves an unstated one unknown", () => {
    expect(mapTank(tank({ tek110Driftstatus: "2" }), NOW).inOperation).toBe(false);
    expect(mapTank(tank({ tek110Driftstatus: null }), NOW).inOperation).toBeNull();
  });

  it("drops a year in the future or before 1900 and an unparseable deadline", () => {
    const mapped = mapTank(tank({ tek067Fabrikationsaar: 2099, tek024Etableringsaar: 1850, tek035SloejfningsfristOlietank: "soon" }), NOW);
    expect(mapped).toMatchObject({ manufacturedYear: null, installedYear: null, decommissionDeadline: null });
  });
});

describe("lookupBbrTanks", () => {
  it("asks for tanks three ways, with BBR's temporal arguments, and merges them by id", async () => {
    const { queries } = fakeDatafordeler(registers({ BBR_TekniskAnlaeg: () => ({ nodes: [tank()] }) }));
    const result = await lookupBbrTanks(HUSNUMMER, NOW);

    const tankQueries = queries.filter((q) => q.includes("BBR_TekniskAnlaeg"));
    expect(tankQueries).toHaveLength(3);
    expect(tankQueries.some((q) => q.includes(`husnummer: { eq: "${HUSNUMMER}" }`))).toBe(true);
    expect(tankQueries.some((q) => q.includes(`bygning: { in: ["${BUILDING}"] }`))).toBe(true);
    expect(tankQueries.some((q) => q.includes(`grund: { in: ["${GRUND}"] }`))).toBe(true);
    for (const q of tankQueries) {
      expect(q).toContain(`tek020Klassifikation: { eq: "${TANK_CLASSIFICATION}" }`);
      expect(q).toMatch(/registreringstid: "[^"]+" virkningstid: "[^"]+"/);
    }
    // The same tank found three ways is one tank.
    expect(result).toMatchObject({ ok: true, data: { tanks: [{ sizeLiters: 1500, decommissioned: false }] } });
  });

  it("answers an empty list when none is registered", async () => {
    fakeDatafordeler(registers());
    expect(await lookupBbrTanks(HUSNUMMER, NOW)).toEqual({ ok: true, data: { tanks: [] } });
  });

  it("only asks by husnummer when the husnummer has no building or grund", async () => {
    const { queries } = fakeDatafordeler({ BBR_Bygning: () => ({ nodes: [] }), BBR_Grund: () => ({ nodes: [] }) });
    await lookupBbrTanks(HUSNUMMER, NOW);
    expect(queries.filter((q) => q.includes("BBR_TekniskAnlaeg"))).toHaveLength(1);
  });

  it("keeps a decommissioned tank in the list, marked, so the checklist can say it was removed", async () => {
    fakeDatafordeler(registers({ BBR_TekniskAnlaeg: () => ({ nodes: [tank({ tek072Sloejfningsaar: 2014 })] }) }));
    expect(await lookupBbrTanks(HUSNUMMER, NOW)).toMatchObject({ ok: true, data: { tanks: [{ decommissioned: true, decommissionedYear: 2014 }] } });
  });

  it("refuses to say 'no tanks' when a page is incomplete or any of the three queries fails", async () => {
    fakeDatafordeler(registers({ BBR_TekniskAnlaeg: () => ({ nodes: [], hasNextPage: true }) }));
    expect(await lookupBbrTanks(HUSNUMMER, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("complete list of tanks") });

    fakeDatafordeler({ ...registers(), BBR_Bygning: () => ({ nodes: [], hasNextPage: true }) });
    expect((await lookupBbrTanks(HUSNUMMER, NOW)).ok).toBe(false);

    vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: { body?: unknown }) => {
      const query = JSON.parse(String(init?.body)).query as string;
      if (query.includes("BBR_TekniskAnlaeg")) return { ok: false, status: 403, headers: new Headers(), json: async () => ({}) };
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ data: { [query.match(/query Q \{ (\w+)/)![1]!]: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    }) as unknown as typeof fetch);
    expect((await lookupBbrTanks(HUSNUMMER, NOW)).ok).toBe(false);
  });

  it("fails with a reason without a husnummer, a valid id or a credential", async () => {
    expect(await lookupBbrTanks(null)).toEqual({ ok: false, error: "no husnummer id to look up" });
    expect(await lookupBbrTanks("not-a-uuid")).toEqual({ ok: false, error: "invalid DAR husnummer UUID" });
    vi.stubEnv("DATAFORDELER_API_KEY", "");
    expect(await lookupBbrTanks(HUSNUMMER)).toEqual({ ok: false, error: "DATAFORDELER_API_KEY not configured" });
  });

  it("serves a deterministic mock only when the flag is set", async () => {
    vi.stubEnv("BBR_MOCK_MODE", "true");
    expect(await lookupBbrTanks(HUSNUMMER)).toEqual(await lookupBbrTanks(HUSNUMMER));
  });
});

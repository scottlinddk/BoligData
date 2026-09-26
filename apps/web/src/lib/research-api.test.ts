import { afterEach, describe, expect, it, vi } from "vitest";
import { getResearchHistory, getResearchMarketHistory } from "./research-api";

vi.mock("./supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } } }) } } }));
afterEach(() => vi.restoreAllMocks());

describe("research history requests", () => {
  it("keeps property chronology and local market populations as distinct authenticated scopes", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await getResearchHistory("subject");
    await getResearchMarketHistory("subject");
    const chronology = new URL(String(request.mock.calls[0]![0]), "https://local.test");
    const market = new URL(String(request.mock.calls[1]![0]), "https://local.test");
    expect(chronology.searchParams.get("propertyId")).toBe("subject");
    expect(chronology.searchParams.has("marketForPropertyId")).toBe(false);
    expect(market.searchParams.get("marketForPropertyId")).toBe("subject");
    expect(market.searchParams.has("propertyId")).toBe(false);
    expect(request.mock.calls[1]![1]).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer test-session" } });
  });
});

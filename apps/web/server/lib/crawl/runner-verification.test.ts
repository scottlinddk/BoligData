import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verificationSourceGroups, verifyCrawlData } from "./runner-verification.js";

describe("runner verification", () => {
  it("reports source metadata without payloads, raw errors or unrecognized values", () => {
    const result = verificationSourceGroups({ bbr: { dataMode: "real", verificationStatus: "unverified", observedAt: "2026-09-26T12:00:00Z", reason: "private-detail", apiKey: "secret" }, noise: { dataMode: "sensitive-text" } });
    expect(result.bbr).toEqual({ dataMode: "real", verificationStatus: "unverified", observedAt: "2026-09-26T12:00:00Z" });
    expect(result.noise?.dataMode).toBe("unknown");
    expect(JSON.stringify(result)).not.toMatch(/private-detail|apiKey|secret|sensitive-text/);
  });
  it("uses SELECT queries only and excludes private evidence from every normalized count", async () => {
    const requests: { table: string; columns: string; filters: [string, unknown][] }[] = [];
    const client = { from(table: string) {
      return { select(columns: string) {
        const request = { table, columns, filters: [] as [string, unknown][] };
        requests.push(request);
        const reply = () => ({ data: table === "properties" ? (request.filters.some(([key, value]) => key === "id" && value === "9dfbb273-37da-4e21-b8c7-f482d2aae19d") ? { id: "target", address: "Bejsebakkevej 30" } : [{ id: "second" }, { id: "third" }]) : table === "enrichments" ? { source_status: {} } : null, count: 1, error: null });
        const query = {
          eq(key: string, value: unknown) { request.filters.push([key, value]); return query; },
          is(key: string, value: unknown) { request.filters.push([key, value]); return query; },
          neq() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(reply()).then(resolve); },
        };
        return query;
      } };
    } } as unknown as SupabaseClient;
    const result = await verifyCrawlData(client);
    expect(result.targetFound).toBe(true);
    expect(result.samples).toHaveLength(3);
    expect(result.samples[0]?.ownRealTransactionCount).toBe(1);
    for (const request of requests.filter(({ table }) => table === "sale_transactions" || table === "listing_events")) {
      expect(request.filters).toContainEqual(["owner_id", null]);
      expect(request.filters).toContainEqual(["data_mode", "real"]);
    }
    expect(requests.every(({ columns }) => !columns.includes("owner_id") && columns !== "*")).toBe(true);
  });
});

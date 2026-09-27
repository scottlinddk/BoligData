import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verificationSourceGroups, verifyCrawlData } from "./runner-verification.js";

describe("runner verification", () => {
  it("reports source metadata without payloads, raw errors or unrecognized values", () => {
    const result = verificationSourceGroups({ bbr: { dataMode: "real", verificationStatus: "unverified", observedAt: "2026-09-26T12:00:00Z", reason: "private-detail", apiKey: "secret" }, noise: { dataMode: "sensitive-text" } });
    expect(result.bbr).toEqual({ dataMode: "real", verificationStatus: "unverified", observedAt: "2026-09-26T12:00:00Z", diagnosticCode: null });
    expect(result.noise?.dataMode).toBe("unknown");
    expect(JSON.stringify(result)).not.toMatch(/private-detail|apiKey|secret|sensitive-text/);
  });
  it.each([
    ["DATAFORDELER_API_KEY not configured", "missing_configuration"],
    ["STOEJKORT_TYPENAME not configured — private configuration detail", "missing_configuration"],
    ["no id_lokalid to look up", "address_identity_missing"],
    ["invalid DAR husnummer UUID", "address_identity_missing"],
    ["no BFE number or matrikelnr/ejerlav to look up", "address_identity_missing"],
    ["no usable coordinates (57,10)", "address_identity_missing"],
    ["no current built BBR building linked to this husnummer", "no_unique_current_building"],
    ["multiple BBR building records linked to this husnummer; building identity is ambiguous", "no_unique_current_building"],
    ["BBR response does not establish a complete building result", "no_unique_current_building"],
    ["BBR response has missing or mismatched building identity", "no_unique_current_building"],
    ["BBR building record is not current and built at the lookup time", "no_unique_current_building"],
    ["HTTP 401 from https://upstream.example?apiKey=private-secret", "http_401"],
    ["HTTP 403 from https://upstream.example?token=private-secret (extended field set also failed: Unknown field 'secret')", "http_403"],
    ["core query failed (extended field set also failed: HTTP 401 from https://upstream.example?apiKey=private-secret)", "http_401"],
    ["BBR schema is missing required identity or temporal fields", "schema_rejected"],
    ["VUR_Ejendomsvurdering is not in the VUR schema (introspection returned no such type)", "schema_rejected"],
    ["no assessed-value field on VUR_Ejendomsvurdering; schema has: private-field", "schema_rejected"],
    ["The field `private-field` does not exist on the type `private-type`.", "schema_rejected"],
    ["The argument `registreringstid` does not exist.", "schema_rejected"],
    ["Unknown field 'private-field'", "schema_rejected"],
    ["Cannot query field 'private-field' on type 'private-type'.", "schema_rejected"],
    ["HTTP 500 from https://upstream.example?apiKey=private-secret", "lookup_failed"],
    ["Unexpected private-secret", "lookup_failed"],
  ])("reduces known source failure %s to the fixed category %s", (reason, diagnosticCode) => {
    const result = verificationSourceGroups({ bbr: { dataMode: "unavailable", verificationStatus: "unavailable", reason } });
    expect(result.bbr).toEqual({ dataMode: "unavailable", verificationStatus: "unavailable", observedAt: null, diagnosticCode });
    expect(JSON.stringify(result)).not.toMatch(/https?:|apiKey|token=|private-|reason/);
  });
  it("never exports malformed failure reasons or coerces arbitrary status objects", () => {
    for (const reason of [null, undefined, 401, ["private-secret"], { error: "private-secret", url: "https://private.example" }]) {
      expect(verificationSourceGroups({ bbr: { dataMode: "unavailable", reason } }).bbr?.diagnosticCode).toBe("lookup_failed");
    }
    const result = verificationSourceGroups({ bbr: { dataMode: ["real"], verificationStatus: { toString: () => "verified", credential: "private-secret" } } });
    expect(result.bbr).toEqual({ dataMode: "unknown", verificationStatus: "unknown", observedAt: null, diagnosticCode: null });
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });
  it("does not infer an active failure from stale reasons on real or mock groups", () => {
    for (const dataMode of ["real", "mock", "unknown"]) {
      expect(verificationSourceGroups({ bbr: { dataMode, reason: "HTTP 401 from private-url" } }).bbr?.diagnosticCode).toBeNull();
    }
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyBoligsidenOriginalAsking } from "./boligsiden-original-price.js";
import type { BoligsidenOriginalAskingInput } from "./boligsiden-original-price.js";
import { fetchJson, HttpError } from "./http.js";

vi.mock("./http.js", async importOriginal => ({ ...await importOriginal<typeof import("./http.js")>(), fetchJson: vi.fn() }));

const NOW = "2026-09-28T12:00:00.000Z";
const CASE_ID = "c4ed5ff9-9e86-4995-8250-c88a62189f27";
const ADDRESS_ID = "0a3f50c9-be71-32b8-e044-0003ba298018";
const OTHER_ID = "44980b4b-1e8c-4e9b-a9c6-a049fde6a876";
const input: BoligsidenOriginalAskingInput = { sourceListingId: CASE_ID, addressId: ADDRESS_ID, postalCode: "9000", currentAsking: 3_850_000, observedAt: NOW };
const address = () => ({
  addressID: ADDRESS_ID, slugAddress: "bejsebakkevej-30-9000-aalborg", isOnMarket: true, hasMultipleCases: false,
  cases: [{ caseID: CASE_ID, address: { addressID: ADDRESS_ID }, status: "open", priceCash: 3_850_000, timeOnMarket: { current: { days: 465 } } }],
});
// Exact public source response observed 2026-09-28. No rounded percentage reconstruction.
const timeline = () => [
  { at: "2026-08-17T09:06:29.809218Z", price: 3_850_000, type: "price_change", aux: { difference: -145_000, differencePercentage: -3.63 } },
  { at: "2026-04-08T12:45:39.164386Z", price: 3_995_000, type: "price_change", aux: { difference: -150_000, differencePercentage: -3.62 } },
  { at: "2025-11-12T15:02:14.856567Z", price: 4_145_000, type: "price_change", aux: { difference: -150_000, differencePercentage: -3.49 } },
  { at: "2025-09-15T12:38:22.657146Z", price: 4_295_000, type: "price_change", aux: { difference: -200_000, differencePercentage: -4.45 } },
  { at: "2025-06-20T10:47:12.159262Z", price: 4_495_000, type: "open" },
  { at: "1994-12-18T00:00:00Z", price: 780_000, type: "sold", aux: { type: "normal" } },
  { at: "1932-12-31T00:00:00Z", type: "built" },
];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.mocked(fetchJson).mockReset(); });
afterEach(() => vi.useRealTimers());

describe("Boligsiden exact original asking from address timeline", () => {
  it("recovers the target's 4,495,000 original opening and exact source date", () => {
    expect(classifyBoligsidenOriginalAsking(input, address(), timeline())).toMatchObject({
      status: "exact", price: 4_495_000, originalDate: "2025-06-20", originalAt: "2025-06-20T10:47:12.159262Z",
      sourceListingId: CASE_ID, sourceAddressId: ADDRESS_ID, scope: "listing", identityConfirmed: true, listingStatus: "active",
      currentPrice: 3_850_000, latestEpisodeDays: 465, previousOpenCount: 0,
      sourceUrl: "https://www.boligsiden.dk/adresse/bejsebakkevej-30-9000-aalborg",
      timelineUrl: `https://api.boligsiden.dk/addresses/${ADDRESS_ID}/timeline`,
    });
  });

  it("uses source evidence even if the stored current price is stale", () => {
    expect(classifyBoligsidenOriginalAsking({ ...input, currentAsking: 3_995_000 }, address(), timeline()).price).toBe(4_495_000);
  });

  it("uses the current episode's opening instead of an older property's campaign", () => {
    const source = address(); source.cases[0]!.priceCash = 8_450_000; source.cases[0]!.timeOnMarket.current.days = 1;
    const history = [
      { at: "2026-09-27T19:11:02.866254Z", price: 8_450_000, type: "open" },
      { at: "2026-08-03T12:25:18.979591Z", price: 8_495_000, type: "closed" },
      { at: "2025-08-12T10:52:49.073374Z", price: 8_995_000, type: "open" },
    ];
    expect(classifyBoligsidenOriginalAsking(input, source, history)).toMatchObject({ status: "exact", price: 8_450_000, originalDate: "2026-09-27", previousOpenCount: 1 });
  });

  function pausedJourney() {
    const source = address(); source.cases[0]!.priceCash = 1_695_000; source.cases[0]!.timeOnMarket.current.days = 111;
    // Live Østre Allé 11: current source duration includes a July pause.
    const history = [
      { at: "2025-11-10T11:20:32.980529Z", price: 1_975_000, type: "open" },
      { at: "2026-05-22T07:36:55.583438Z", price: 1_895_000, type: "closed" },
      { at: "2026-06-09T08:21:59.901416Z", price: 1_750_000, type: "open" },
      { at: "2026-07-14T08:20:42.589361Z", price: 1_750_000, type: "closed" },
      { at: "2026-07-23T07:49:32.060276Z", price: 1_750_000, type: "open" },
      { at: "2026-09-01T07:25:47.645425Z", price: 1_695_000, type: "price_change", aux: { difference: -55_000 } },
    ];
    return { source, history };
  }

  it("retains the uniquely duration-matched opening through a continuous same-price pause", () => {
    const { source, history } = pausedJourney();
    expect(classifyBoligsidenOriginalAsking(input, source, history)).toMatchObject({ status: "exact", price: 1_750_000, originalDate: "2026-06-09", latestEpisodeDays: 111, previousOpenCount: 1 });
  });

  it("does not carry an original through a differently priced reopening", () => {
    const { source, history } = pausedJourney(); history[4]!.price = 1_800_000;
    expect(classifyBoligsidenOriginalAsking(input, source, history)).toMatchObject({ status: "conflict", reason: "inconsistent_reopening_price", price: null });
  });

  it("does not carry an original through an intervening sale", () => {
    const { source, history } = pausedJourney();
    history.push({ at: "2026-07-20T00:00:00Z", price: 1_750_000, type: "sold" });
    expect(classifyBoligsidenOriginalAsking(input, source, history)).toMatchObject({ status: "conflict", reason: "sale_after_current_episode_opening", price: null });
  });

  it("does not choose arbitrarily when multiple openings match the source duration", () => {
    const { source, history } = pausedJourney();
    history.push({ at: "2026-06-09T09:00:00Z", price: 1_750_000, type: "closed" });
    history.push({ at: "2026-06-10T09:00:00Z", price: 1_750_000, type: "open" });
    expect(classifyBoligsidenOriginalAsking(input, source, history)).toMatchObject({ status: "conflict", reason: "multiple_openings_match_current_episode", price: null });
  });

  it("does not join an access-address identifier or another case", () => {
    expect(classifyBoligsidenOriginalAsking({ ...input, addressId: OTHER_ID }, address(), timeline()).status).toBe("conflict");
    expect(classifyBoligsidenOriginalAsking({ ...input, sourceListingId: OTHER_ID }, address(), timeline())).toMatchObject({ status: "not_current", identityConfirmed: false, price: null });
  });

  it("does not guess among multiple active cases at one address", () => {
    const source = address(); source.cases.push({ ...source.cases[0]!, caseID: OTHER_ID });
    expect(classifyBoligsidenOriginalAsking(input, source, timeline())).toMatchObject({ status: "conflict", reason: "multiple_active_cases_at_address", price: null });
  });

  it("rejects a source case that is now closed", () => {
    const source = address(); source.cases[0]!.status = "closed";
    expect(classifyBoligsidenOriginalAsking(input, source, timeline())).toMatchObject({ status: "not_current", identityConfirmed: true, listingStatus: "closed", price: null });
  });

  it("rejects a closure after the latest opening even if the address snapshot is active", () => {
    const history = [...timeline(), { at: "2026-09-28T00:00:00Z", price: 3_850_000, type: "closed" }];
    expect(classifyBoligsidenOriginalAsking(input, address(), history)).toMatchObject({ status: "not_current", reason: "timeline_closed_after_latest_open", price: null });
  });

  it.each(["2026-09-29T00:00:00Z", "2026-02-30T00:00:00Z", "unknown"])("rejects future or malformed event timestamp %s", at => {
    const history = timeline(); history[0]!.at = at;
    expect(classifyBoligsidenOriginalAsking(input, address(), history)).toMatchObject({ status: "conflict", price: null });
  });

  it("requires the source duration to corroborate the latest opening", () => {
    const source = address(); source.cases[0]!.timeOnMarket.current.days = 460;
    expect(classifyBoligsidenOriginalAsking(input, source, timeline())).toMatchObject({ status: "conflict", reason: "opening_does_not_match_current_episode" });
    source.cases[0]!.timeOnMarket.current.days = 464;
    expect(classifyBoligsidenOriginalAsking(input, source, timeline()).status).toBe("exact");
  });

  it("requires a consistent price path ending at the live case's current price", () => {
    const history = timeline(); history[0]!.price = 3_840_000;
    expect(classifyBoligsidenOriginalAsking(input, address(), history)).toMatchObject({ status: "conflict", reason: "inconsistent_price_change_path" });
    const source = address(); source.cases[0]!.priceCash = 3_995_000;
    expect(classifyBoligsidenOriginalAsking(input, source, timeline())).toMatchObject({ status: "conflict", reason: "timeline_current_price_mismatch" });
  });

  it("does not substitute current or price-change values when the opening amount is absent", () => {
    expect(classifyBoligsidenOriginalAsking(input, address(), timeline().filter(row => row.type !== "open"))).toMatchObject({ status: "missing", reason: "no_original_open_event", price: null });
    const history = timeline(); history[4]!.price = 0;
    expect(classifyBoligsidenOriginalAsking(input, address(), history)).toMatchObject({ status: "missing", reason: "original_open_price_missing", price: null });
  });

  it("rejects a guessed timeline wrapper instead of silently accepting another schema", () => {
    expect(classifyBoligsidenOriginalAsking(input, address(), { timeline: timeline() })).toMatchObject({ status: "unavailable", reason: "invalid_timeline_shape" });
  });
});

describe("bounded source original-price retrieval", () => {
  async function resolver() {
    vi.resetModules();
    return (await import("./boligsiden-original-price.js")).fetchBoligsidenOriginalAsking;
  }
  it("uses verified source address IDs directly and never calls the blocked case endpoint", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(address()).mockResolvedValueOnce(timeline());
    const result = await (await resolver())(input);
    expect(result).toMatchObject({ status: "exact", price: 4_495_000 });
    expect(fetchJson).toHaveBeenNthCalledWith(1, `https://api.boligsiden.dk/addresses/${ADDRESS_ID}`, { attempts: 1, timeoutMs: 6_000 });
    expect(fetchJson).toHaveBeenNthCalledWith(2, `https://api.boligsiden.dk/addresses/${ADDRESS_ID}/timeline`, { attempts: 1, timeoutMs: 6_000 });
  });

  it("discovers the source address by exact case ID, not the first matching price", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 2, cases: [
      { caseID: OTHER_ID, address: { addressID: OTHER_ID } },
      { caseID: CASE_ID, address: { addressID: ADDRESS_ID } },
    ] }).mockResolvedValueOnce(address()).mockResolvedValueOnce(timeline());
    expect(await (await resolver())({ ...input, addressId: null })).toMatchObject({ status: "exact", sourceAddressId: ADDRESS_ID });
    const url = new URL(vi.mocked(fetchJson).mock.calls[0]![0]);
    expect(url.searchParams.get("zipCodes")).toBe("9000");
    expect(url.searchParams.get("priceMin")).toBe("3850000");
  });

  it("finds a stale-price case in the postcode feed without using its new price as original", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 0, cases: null })
      .mockResolvedValueOnce({ totalHits: 1, cases: [{ caseID: CASE_ID, address: { addressID: ADDRESS_ID } }] })
      .mockResolvedValueOnce(address()).mockResolvedValueOnce(timeline());
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: 3_995_000 })).toMatchObject({ status: "exact", price: 4_495_000 });
    expect(vi.mocked(fetchJson).mock.calls[1]![0]).not.toContain("priceMin");
  });

  it("reports a complete current feed without the case as not current", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 0, cases: null });
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "not_current", price: null, identityConfirmed: false });
  });

  it("reports bounded discovery as unavailable, not proof of a missing original", async () => {
    for (let page = 0; page < 20; page++) {
      vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 2_100, cases: Array.from({ length: 100 }, (_, index) => ({
        caseID: `00000000-0000-0000-0000-${String(page * 100 + index).padStart(12, "0")}`, address: { addressID: ADDRESS_ID },
      })) });
    }
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "unavailable", reason: "bounded_search", price: null });
    expect(fetchJson).toHaveBeenCalledTimes(20);
  });

  it("discovers a case beyond the former 500-case limit and shares the complete postcode snapshot", async () => {
    for (let page = 0; page < 6; page++) {
      vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 601, cases: Array.from({ length: 100 }, (_, index) => ({
        caseID: `00000000-0000-0000-0000-${String(page * 100 + index).padStart(12, "0")}`, address: { addressID: ADDRESS_ID },
      })) });
    }
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 601, cases: [{ caseID: CASE_ID, address: { addressID: ADDRESS_ID } }] })
      .mockResolvedValueOnce(address()).mockResolvedValueOnce(timeline());
    const fetchOriginal = await resolver();
    expect(await fetchOriginal({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "exact", price: 4_495_000 });
    expect(fetchJson).toHaveBeenCalledTimes(9);
    expect(await fetchOriginal({ ...input, sourceListingId: OTHER_ID, addressId: null, currentAsking: null })).toMatchObject({ status: "not_current", reason: "source_case_absent_from_current_postcode_feed" });
    expect(fetchJson).toHaveBeenCalledTimes(9);
  });

  it.each([undefined, 1])("does not interpret null cases with total %s as a valid empty source", async totalHits => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits, cases: null });
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "unavailable", reason: "invalid_case_search_shape" });
  });

  it("does not treat repeated pages as complete postcode coverage", async () => {
    const repeatedPage = { totalHits: 200, cases: Array.from({ length: 100 }, (_, index) => ({
      caseID: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`, address: { addressID: ADDRESS_ID },
    })) };
    vi.mocked(fetchJson).mockResolvedValue(repeatedPage);
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "unavailable", reason: "nonadvancing_source_pagination", price: null });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("does not treat an empty page before the advertised total as complete", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ totalHits: 2, cases: [{ caseID: OTHER_ID, address: { addressID: ADDRESS_ID } }] })
      .mockResolvedValueOnce({ totalHits: 2, cases: [] });
    expect(await (await resolver())({ ...input, addressId: null, currentAsking: null })).toMatchObject({ status: "unavailable", reason: "incomplete_source_pagination", price: null });
  });

  it("reports source denial without retrying or substituting a price", async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new HttpError(403, "https://api.boligsiden.dk/addresses/source"));
    expect(await (await resolver())(input)).toMatchObject({ status: "unavailable", reason: "http_403", price: null, sourceAddressId: ADDRESS_ID, timelineUrl: `https://api.boligsiden.dk/addresses/${ADDRESS_ID}/timeline` });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });
});

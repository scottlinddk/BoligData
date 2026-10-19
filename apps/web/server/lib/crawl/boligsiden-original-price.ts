import { fetchJson, HttpError } from "./http.js";

const API_ORIGIN = "https://api.boligsiden.dk";
const PUBLIC_ORIGIN = "https://www.boligsiden.dk";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DAY = 86_400_000;
const MAX_POSTCODE_PAGES = 20;

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const uuid = (value: unknown): string | null => typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;

export interface BoligsidenOriginalAskingInput {
  sourceListingId: string;
  /** Boligsiden's address.addressID, never an access-address/BBR identifier. */
  addressId?: string | null;
  listingUrl?: string | null;
  postalCode?: string | null;
  /** Only narrows source discovery; never supplies the original price. */
  currentAsking?: number | null;
  status?: string;
  observedAt?: string;
}

export interface BoligsidenOriginalAskingResult {
  status: "exact" | "missing" | "unavailable" | "conflict" | "not_current";
  price: number | null;
  originalDate: string | null;
  originalAt: string | null;
  sourceUrl: string;
  timelineUrl: string | null;
  sourceListingId: string;
  sourceAddressId: string | null;
  scope: "listing";
  /** Which source duration establishes the beginning of the asking-price history. */
  priceScope?: "current_listing" | "total_marketing_period";
  totalDays?: number | null;
  reason: string | null;
  observedAt: string;
  identityConfirmed: boolean;
  listingStatus: "active" | "closed" | "unknown";
  currentPrice: number | null;
  latestEpisodeDays: number | null;
  previousOpenCount: number;
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === PUBLIC_ORIGIN && /^\/adresse\/[^/]+\/?$/.test(url.pathname) ? `${url.origin}${url.pathname}` : null;
  } catch { return null; }
}

function empty(input: BoligsidenOriginalAskingInput, addressId: string | null = null): BoligsidenOriginalAskingResult {
  return {
    status: "missing", price: null, originalDate: null, originalAt: null,
    sourceUrl: publicUrl(input.listingUrl) ?? `${API_ORIGIN}/search/cases`,
    timelineUrl: addressId ? `${API_ORIGIN}/addresses/${addressId}/timeline` : null,
    sourceListingId: input.sourceListingId, sourceAddressId: addressId, scope: "listing",
    reason: null, observedAt: input.observedAt ?? new Date().toISOString(),
    identityConfirmed: false, listingStatus: "unknown", currentPrice: null,
    latestEpisodeDays: null, previousOpenCount: 0, priceScope: "current_listing", totalDays: null,
  };
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const stamp = Date.parse(value);
  const day = value.slice(0, 10);
  return Number.isFinite(stamp) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day ? stamp : null;
}

/** The public address timeline has no case IDs. Join through the address's
 * unique active case, then corroborate a unique opening with its source
 * duration and complete price-change path. Then walk previous broker periods
 * backwards to account for the total source duration, excluding handover gaps.
 * Repriced reopenings within the current broker period need either an
 * explicit matching adjustment or the case's cumulative percentage to corroborate
 * the observed opening amount; percentages never reconstruct a missing price. */
export function classifyBoligsidenOriginalAsking(
  input: BoligsidenOriginalAskingInput,
  addressPayload: unknown,
  timelinePayload: unknown,
): BoligsidenOriginalAskingResult {
  const address = object(addressPayload);
  const sourceAddressId = uuid(address?.addressID);
  const result = empty(input, sourceAddressId);
  const fail = (status: BoligsidenOriginalAskingResult["status"], reason: string) => ({ ...result, status, reason });
  const expectedCase = uuid(input.sourceListingId);
  if (!expectedCase || !sourceAddressId || (input.addressId && uuid(input.addressId) !== sourceAddressId)) return fail("conflict", "address_identity_mismatch");
  const slug = text(address?.slugAddress);
  if (slug && /^[a-z0-9-]+$/i.test(slug)) result.sourceUrl = `${PUBLIC_ORIGIN}/adresse/${slug}`;
  if (address?.cases === null || (Array.isArray(address?.cases) && address.cases.length === 0)) {
    // Off-market address responses legitimately contain no cases. This proves
    // no current listing at the verified address, not the absent case's identity.
    if (address.hasMultipleCases !== undefined && typeof address.hasMultipleCases !== "boolean") return fail("unavailable", "invalid_address_market_state");
    if (address.isOnMarket === false && address.hasMultipleCases !== true) return fail("not_current", "source_address_off_market");
    if (address.isOnMarket === true || address.hasMultipleCases === true) return fail("conflict", "inconsistent_address_market_state");
    return fail("unavailable", "missing_address_market_state");
  }
  if (!Array.isArray(address?.cases)) return fail("unavailable", "missing_address_cases");
  const cases = address.cases.map(object).filter((row): row is JsonObject => row !== null);
  const activeCases = cases.filter(row => row.status === "open");
  const matching = cases.filter(row => uuid(row.caseID) === expectedCase);
  if (matching.length !== 1) return fail(matching.length === 0 ? "not_current" : "conflict", "source_case_not_unique_at_address");
  const current = matching[0]!;
  result.identityConfirmed = true;
  result.listingStatus = current.status === "open" ? "active" : "closed";
  if (current.status !== "open" || address.isOnMarket === false) return fail("not_current", "source_case_closed");
  if (activeCases.length !== 1 || address.hasMultipleCases === true) return fail("conflict", "multiple_active_cases_at_address");
  const nestedAddress = object(current.address);
  if (nestedAddress?.addressID !== undefined && uuid(nestedAddress.addressID) !== sourceAddressId) return fail("conflict", "case_address_mismatch");
  result.currentPrice = positive(current.priceCash) ? current.priceCash : null;
  const duration = object(object(current.timeOnMarket)?.current)?.days;
  const validDays = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 36_500;
  result.latestEpisodeDays = validDays(duration) ? duration : null;
  const total = object(current.timeOnMarket)?.total;
  if (total !== undefined) {
    const days = object(total)?.days;
    if (!validDays(days) || (result.latestEpisodeDays !== null && days < result.latestEpisodeDays)) return fail("conflict", "invalid_total_market_duration");
    result.totalDays = days;
  }
  const observedStamp = timestamp(result.observedAt);
  if (observedStamp === null || observedStamp > Date.now()) return fail("conflict", "invalid_observation_time");
  if (!Array.isArray(timelinePayload)) return fail("unavailable", "invalid_timeline_shape");
  const events: { at: string; stamp: number; price: number | null; type: string; difference: number | null; saleType: string | null }[] = [];
  for (const raw of timelinePayload) {
    const event = object(raw);
    const type = text(event?.type);
    if (!type || !["open", "closed", "sold", "price_change"].includes(type)) continue;
    const stamp = timestamp(event?.at);
    if (stamp === null || stamp > observedStamp) return fail("conflict", "invalid_or_future_timeline_event");
    const difference = object(event?.aux)?.difference;
    events.push({ at: event!.at as string, stamp, price: positive(event?.price) ? event.price : null,
      type, difference: typeof difference === "number" && Number.isFinite(difference) ? difference : null,
      saleType: type === "sold" ? text(object(event?.aux)?.type) : null });
  }
  events.sort((a, b) => a.stamp - b.stamp);
  const deduplicated = events.filter((event, index) => index === 0 || JSON.stringify(event) !== JSON.stringify(events[index - 1]));
  const unique: typeof events = [];
  for (let index = 0; index < deduplicated.length; index++) {
    const event = deduplicated[index]!;
    const next = deduplicated[index + 1];
    // Boligsiden can publish the same reopening as both open and price_change.
    // Merge only this exact pair; its explicit delta is checked against the
    // preceding asking price below, without applying the adjustment twice.
    if (next && event.at === next.at && event.price !== null && event.price === next.price &&
      deduplicated[index + 2]?.stamp !== event.stamp &&
      [event.type, next.type].includes("open") && [event.type, next.type].includes("price_change")) {
      const open = event.type === "open" ? event : next;
      const change = event.type === "price_change" ? event : next;
      if (change.difference !== null) {
        unique.push({ ...open, difference: change.difference });
        index++;
        continue;
      }
    }
    unique.push(event);
  }
  const openings = unique.flatMap((event, index) => event.type === "open" ? [index] : []);
  if (openings.length === 0) return fail("missing", "no_original_open_event");
  if (result.latestEpisodeDays === null) return fail("conflict", "current_episode_duration_missing");
  // Source day counts and event timestamps can straddle midnight/refresh cycles.
  const dayDistance = (index: number) => {
    const calendarDays = Math.floor((Date.parse(result.observedAt.slice(0, 10)) - Date.parse(unique[index]!.at.slice(0, 10))) / DAY);
    return Math.abs(calendarDays - result.latestEpisodeDays!);
  };
  const exactDayOpenings = openings.filter(index => dayDistance(index) === 0);
  const matchingOpenings = exactDayOpenings.length ? exactDayOpenings : openings.filter(index => dayDistance(index) <= 1);
  if (matchingOpenings.length === 0) return fail("conflict", "opening_does_not_match_current_episode");
  if (matchingOpenings.length !== 1) return fail("conflict", "multiple_openings_match_current_episode");
  const opening = matchingOpenings[0]!;
  for (let index = Math.max(1, opening); index < unique.length; index++) {
    if (unique[index]!.stamp === unique[index - 1]!.stamp) return fail("conflict", "ambiguous_simultaneous_timeline_events");
  }
  const original = unique[opening]!;
  result.previousOpenCount = unique.slice(0, opening).filter(event => event.type === "open").length;
  if (original.price === null) return fail("missing", "original_open_price_missing");
  if (original.difference !== null) return fail("conflict", "ambiguous_original_open_adjustment");
  const sourcePercentage = current.priceChangePercentage;
  const percentageCorroboratesPrice = (price: number | null): boolean => price !== null && result.currentPrice !== null && typeof sourcePercentage === "number" &&
    Number.isFinite(sourcePercentage) && sourcePercentage > -100 &&
    Math.abs(((result.currentPrice - price) / price) * 100 - sourcePercentage) <= 0.005_000_001;
  const percentageCorroborates = percentageCorroboratesPrice(original.price);
  const differentlyPricedAdjacentOpenings = openings.filter(index => dayDistance(index) <= 1 && unique[index]!.price !== original.price);
  if (differentlyPricedAdjacentOpenings.length && (!percentageCorroborates || differentlyPricedAdjacentOpenings.some(index =>
    unique[index]!.price === null || percentageCorroboratesPrice(unique[index]!.price)))) return fail("conflict", "adjacent_opening_price_conflict");
  const journey = unique.slice(opening + 1);
  const previousAgentClosure = (closing: typeof original): boolean => {
    // During a one-day agent handover the old agent can close its advertisement
    // after the new listing opens. Bind that close to the old price path AND
    // the source's two distinct realtor durations, never merely to a lower price.
    if (!percentageCorroborates || sourcePercentage !== 0 || original.price !== result.currentPrice || dayDistance(opening) !== 0) return false;
    const overlapDays = Math.floor((Date.parse(closing.at.slice(0, 10)) - Date.parse(original.at.slice(0, 10))) / DAY);
    if (overlapDays < 0 || overlapDays > 1 || closing.price === original.price) return false;
    const currentRealtor = uuid(object(current.realtor)?.realtorID);
    const total = object(object(current.timeOnMarket)?.total);
    const realtors = Array.isArray(total?.realtors) ? total.realtors.map(object).filter((row): row is JsonObject => row !== null) : [];
    if (!currentRealtor || realtors.length !== 2 || realtors.filter(row => uuid(row.realtorId) === currentRealtor && row.days === result.latestEpisodeDays).length !== 1) return false;
    const previousOpening = openings.filter(index => index < opening).pop();
    if (previousOpening === undefined) return false;
    const previous = unique[previousOpening]!;
    if (previous.price === null) return false;
    let previousPrice = previous.price;
    for (const event of unique.slice(previousOpening + 1, opening)) {
      if (event.type !== "price_change" || event.price === null ||
        (event.difference !== null && Math.abs(previousPrice + event.difference - event.price) > 1)) return false;
      previousPrice = event.price;
    }
    if (closing.price !== previousPrice) return false;
    const priorDays = Math.floor((Date.parse(closing.at.slice(0, 10)) - Date.parse(previous.at.slice(0, 10))) / DAY);
    const combinedDays = Math.floor((Date.parse(result.observedAt.slice(0, 10)) - Date.parse(previous.at.slice(0, 10))) / DAY);
    return total?.days === combinedDays && realtors.filter(row => uuid(row.realtorId) !== null && uuid(row.realtorId) !== currentRealtor && row.days === priorDays).length === 1;
  };
  let latestPrice = original.price;
  let active = true;
  let overlappingClosure: typeof original | null = null;
  for (const event of journey) {
    if (event.type === "sold") {
      // A registered family transfer is not a market sale ending this listing.
      // Retain it only when the source still identifies the same active journey
      // and independently corroborates the observed opening amount.
      const matchingFamilyRegistration = Array.isArray(address?.registrations) && address.registrations.some(raw => {
        const registration = object(raw);
        return registration?.type === "family" && registration.date === event.at.slice(0, 10) && registration.amount === event.price;
      });
      if (event.saleType === "family" && active && percentageCorroborates && matchingFamilyRegistration) continue;
      return fail("conflict", "sale_after_current_episode_opening");
    }
    if (event.type === "closed") {
      if (active && event.price !== latestPrice && previousAgentClosure(event)) {
        overlappingClosure = event;
        continue;
      }
      if (!active || event.price !== latestPrice) return fail("conflict", "inconsistent_pause_price");
      active = false;
      continue;
    }
    if (event.type === "open") {
      if (active || event.price === null) return fail("conflict", "inconsistent_reopening_price");
      if (event.difference !== null && Math.abs(latestPrice + event.difference - event.price) > 1) return fail("conflict", "inconsistent_reopening_adjustment");
      if (event.price !== latestPrice && event.difference === null && !percentageCorroborates) return fail("conflict", "inconsistent_reopening_price");
      latestPrice = event.price;
      active = true;
      continue;
    }
    if (event.type !== "price_change") continue;
    if (!active) return fail("conflict", "price_change_while_closed");
    if (event.price === null) return fail("conflict", "price_change_amount_missing");
    if (event.difference !== null && Math.abs(latestPrice + event.difference - event.price) > 1) return fail("conflict", "inconsistent_price_change_path");
    latestPrice = event.price;
  }
  if (!active) return fail("not_current", "timeline_closed_after_latest_open");
  if (result.currentPrice === null || latestPrice !== result.currentPrice) return fail("conflict", "timeline_current_price_mismatch");
  let first = original;
  if (result.totalDays !== null && result.totalDays !== undefined) {
    // Current days can include same-broker pauses. Keep that source-verified
    // span intact; do not subtract every closed/open gap in the timeline.
    // Earlier broker periods contribute their open-to-close days. Off-market
    // handover gaps contribute none, and a verified overlap is counted once.
    const calendarDays = (from: string, to: string) => (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY;
    let coveredDays = result.latestEpisodeDays;
    let cursor = opening;
    while (coveredDays < result.totalDays) {
      const closing = overlappingClosure ?? unique[cursor - 1];
      let index = overlappingClosure ? cursor - 1 : cursor - 2;
      overlappingClosure = null;
      if (!closing) return fail("missing", "total_market_opening_missing");
      if (closing.type === "sold") return fail("conflict", "sale_between_market_periods");
      if (closing.type !== "closed" || closing.price === null) return fail("conflict", "incomplete_previous_market_period");
      const nextOpening = unique[cursor]!;
      const resetAt = new Date(`${closing.at.slice(0, 10)}T00:00:00Z`);
      resetAt.setUTCFullYear(resetAt.getUTCFullYear() + 3);
      if (Date.parse(nextOpening.at.slice(0, 10)) >= resetAt.getTime()) return fail("conflict", "market_period_reset_after_long_gap");
      const changes: typeof events = [];
      for (; index >= 0 && unique[index]!.type !== "open"; index--) {
        const event = unique[index]!;
        if (event.type === "sold") return fail("conflict", "sale_between_market_periods");
        if (event.type !== "price_change") return fail("conflict", "incomplete_previous_market_period");
        changes.unshift(event);
      }
      const previous = unique[index];
      if (!previous || previous.price === null) return fail("missing", "total_market_opening_missing");
      if (previous.difference !== null) return fail("conflict", "ambiguous_original_open_adjustment");
      let priorPrice = previous.price;
      for (const change of changes) {
        if (change.price === null || change.stamp <= previous.stamp || change.stamp >= closing.stamp ||
            (change.difference !== null && Math.abs(priorPrice + change.difference - change.price) > 1)) return fail("conflict", "inconsistent_previous_price_path");
        priorPrice = change.price;
      }
      if (priorPrice !== closing.price || closing.stamp <= previous.stamp) return fail("conflict", "inconsistent_previous_price_path");
      const endAt = closing.stamp > nextOpening.stamp ? nextOpening.at : closing.at;
      coveredDays += calendarDays(previous.at, endAt);
      if (coveredDays > result.totalDays) return fail("conflict", "previous_period_exceeds_total_duration");
      first = previous;
      cursor = index;
    }
    // An additional zero-day broker period consumes no duration budget. The
    // total alone cannot establish which of those openings began the journey.
    const priorClose = unique[cursor - 1];
    const priorOpenIndex = openings.filter(index => index < cursor).at(-1);
    if (priorClose?.type === "closed" && priorOpenIndex !== undefined &&
        calendarDays(unique[priorOpenIndex]!.at, priorClose.at) === 0 &&
        !unique.slice(priorOpenIndex + 1, cursor).some(event => event.type === "sold")) {
      return fail("conflict", "ambiguous_zero_day_market_period");
    }
    result.priceScope = "total_marketing_period";
    result.previousOpenCount = unique.slice(0, cursor).filter(event => event.type === "open").length;
  }
  return { ...result, status: "exact", price: first.price, originalDate: first.at.slice(0, 10), originalAt: first.at };
}

interface PostcodeDiscovery { addresses: Map<string, string>; complete: boolean; reason: string | null }
const postcodeCache = new Map<string, { expires: number; value: Promise<PostcodeDiscovery> }>();

async function request(url: string, deadline: number): Promise<unknown> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("source_deadline_exceeded");
  return fetchJson(url, { attempts: 1, timeoutMs: Math.min(6_000, remaining) });
}

function caseAddresses(payload: unknown): { addresses: Map<string, string>; count: number; total: number | null } {
  const page = object(payload);
  const total = typeof page?.totalHits === "number" && Number.isInteger(page.totalHits) && page.totalHits >= 0 ? page.totalHits : null;
  // The live search API returns `cases: null` when no records match. Only an
  // explicit zero total makes that a complete empty result, not a malformed feed.
  if (page?.cases == null && total === 0) return { addresses: new Map(), count: 0, total };
  if (!Array.isArray(page?.cases)) throw new Error("invalid_case_search_shape");
  const addresses = new Map<string, string>();
  for (const raw of page.cases) {
    const row = object(raw);
    const caseId = uuid(row?.caseID);
    const addressId = uuid(object(row?.address)?.addressID);
    if (caseId && addressId) {
      if (addresses.has(caseId) && addresses.get(caseId) !== addressId) throw new Error("conflicting_source_case_addresses");
      addresses.set(caseId, addressId);
    }
  }
  return { addresses, count: page.cases.length, total };
}

function postcodeAddresses(postalCode: string, deadline: number): Promise<PostcodeDiscovery> {
  const cached = postcodeCache.get(postalCode);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (async (): Promise<PostcodeDiscovery> => {
    const addresses = new Map<string, string>();
    try {
      for (let page = 1; page <= MAX_POSTCODE_PAGES; page++) {
        const query = new URLSearchParams({ zipCodes: postalCode, per_page: "100", page: String(page), sortBy: "timeOnMarket", sortAscending: "true" });
        const result = caseAddresses(await request(`${API_ORIGIN}/search/cases?${query}`, deadline));
        const before = addresses.size;
        for (const [caseId, addressId] of result.addresses) {
          if (addresses.has(caseId) && addresses.get(caseId) !== addressId) return { addresses: new Map(), complete: false, reason: "conflicting_source_case_addresses" };
          addresses.set(caseId, addressId);
        }
        if (result.count === 0) {
          const complete = result.total !== null && addresses.size >= result.total;
          return { addresses, complete, reason: complete ? null : "incomplete_source_pagination" };
        }
        // Only unique, valid case/address pairs establish coverage. Repeated or
        // malformed rows cannot prove that an absent case is no longer current.
        if (addresses.size - before !== result.count) return { addresses, complete: false, reason: "nonadvancing_source_pagination" };
        if (result.total !== null && addresses.size >= result.total) return { addresses, complete: true, reason: null };
        if (addresses.size === before) return { addresses, complete: false, reason: "nonadvancing_source_pagination" };
      }
      return { addresses, complete: false, reason: "bounded_search" };
    } catch (error) {
      return { addresses, complete: false, reason: error instanceof Error ? error.message : "source_search_failed" };
    }
  })();
  postcodeCache.set(postalCode, { expires: Date.now() + 60_000, value });
  if (postcodeCache.size > 100) postcodeCache.delete(postcodeCache.keys().next().value!);
  return value;
}

/** At most 12 seconds per resolver; no retries or browser-challenge bypass.
 * Current price is only a discovery optimization. A cached bounded postcode
 * search can find a source case after its asking price changed. */
export async function fetchBoligsidenOriginalAsking(input: BoligsidenOriginalAskingInput): Promise<BoligsidenOriginalAskingResult> {
  const started = Date.now();
  const deadline = started + 12_000;
  const result = empty({ ...input, observedAt: input.observedAt ?? new Date(started).toISOString() });
  const fail = (status: BoligsidenOriginalAskingResult["status"], reason: string) => ({ ...result, status, reason });
  const caseId = uuid(input.sourceListingId);
  if (!caseId) return fail("missing", "invalid_source_case_id");
  let addressId = uuid(input.addressId);
  try {
    if (!addressId) {
      if (!input.postalCode || !/^\d{4}$/.test(input.postalCode)) return fail("unavailable", "source_address_identity_missing");
      if (positive(input.currentAsking)) {
        const query = new URLSearchParams({ zipCodes: input.postalCode, priceMin: String(input.currentAsking), priceMax: String(input.currentAsking), per_page: "100", page: "1" });
        const result = caseAddresses(await request(`${API_ORIGIN}/search/cases?${query}`, deadline));
        addressId = result.addresses.get(caseId) ?? null;
      }
      if (!addressId) {
        const discovery = await postcodeAddresses(input.postalCode, deadline);
        addressId = discovery.addresses.get(caseId) ?? null;
        if (!addressId) return fail(discovery.complete ? "not_current" : "unavailable", discovery.reason ?? "source_case_absent_from_current_postcode_feed");
      }
    }
    result.sourceAddressId = addressId;
    result.timelineUrl = `${API_ORIGIN}/addresses/${addressId}/timeline`;
    const addressPayload = await request(`${API_ORIGIN}/addresses/${addressId}`, deadline);
    const classificationInput = { ...input, addressId, observedAt: result.observedAt };
    const addressOnly = classifyBoligsidenOriginalAsking(classificationInput, addressPayload, undefined);
    if (addressOnly.status === "not_current" && addressOnly.reason === "source_address_off_market") return addressOnly;
    const timelinePayload = await request(`${API_ORIGIN}/addresses/${addressId}/timeline`, deadline);
    return classifyBoligsidenOriginalAsking(classificationInput, addressPayload, timelinePayload);
  } catch (error) {
    return fail("unavailable", error instanceof HttpError ? `http_${error.status}` : error instanceof Error ? error.message : "source_request_failed");
  }
}

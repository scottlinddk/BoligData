import {
  calculateResearchTimeMetrics, parseResearchDay, researchDateBounds,
  type ResearchActiveInterval, type ResearchDate, type ResearchTimeMetrics,
} from "@shared/analysis";
import type { Property } from "@shared/types/index";
import type { ResearchEpisode, ResearchEvent, ResearchHistoryResponse } from "@shared/types/research-api";
import { reportedListingDuration } from "./reported-listing-duration";

const DAY = 86_400_000;

export interface ResearchListingTimeResult {
  time: ResearchTimeMetrics;
  firstAsking: number | null;
  /** All real observations for this property, including earlier campaigns. */
  events: ResearchEvent[];
  campaignId: string | null;
  warnings: string[];
  /** Present only when the latest duration is a dated source count rather
   * than elapsed days calculated from a documented start. */
  latestEpisodeSource?: { kind: "source_reported"; source: string; observedAt: string } | null;
}

function dayOf(value: string | null | undefined): string | null {
  if (!value || (value.length !== 10 && !Number.isFinite(Date.parse(value)))) return null;
  const day = value.slice(0, 10);
  return parseResearchDay(day) !== null ? day : null;
}
function eventDate(event: ResearchEvent): ResearchDate | null {
  if (!event.eventDate || !["day", "month"].includes(event.datePrecision)) return null;
  const date: ResearchDate = event.datePrecision === "month"
    ? { value: event.eventDate.slice(0, 7), precision: "month" }
    : { value: event.eventDate, precision: "day" };
  return researchDateBounds(date) ? date : null;
}
function eventSortDate(event: ResearchEvent): string {
  const date = eventDate(event);
  return (date ? researchDateBounds(date)?.earliest : dayOf(event.eventDate)) ?? dayOf(event.observedAt) ?? "9999-12-31";
}
function preciseEpisode(episode: ResearchEpisode, asOf: string): ResearchActiveInterval | null {
  const observed = dayOf(episode.observedAt);
  const start = episode.startDate;
  const end = episode.endDate;
  if (episode.dataMode !== "real" || episode.datePrecision !== "day" || !observed || observed > asOf ||
    !start || parseResearchDay(start) === null || start > observed || episode.status === "unknown" ||
    (episode.status === "active" ? end !== null : end === null) ||
    (end !== null && (parseResearchDay(end) === null || end < start || end > observed))) return null;
  return { start: { value: start, precision: "day" }, end: end ? { value: end, precision: "day" } : null, source: episode.source };
}
function hasContradictoryLifecycle(episode: ResearchEpisode, events: ResearchEvent[], asOf: string): boolean {
  if (episode.status !== "active") return false;
  return events.some((event) => {
    if (event.episodeId !== episode.id || !["paused", "removed", "sold", "relisted"].includes(event.eventType)) return false;
    const date = eventDate(event);
    const start = date ? researchDateBounds(date)?.earliest : dayOf(event.eventDate);
    if (start && start > asOf) return true;
    if (["paused", "removed", "sold"].includes(event.eventType)) return true;
    // A later restart attached to the same episode makes its older start stale.
    return !!(start && episode.startDate && start > episode.startDate);
  });
}

/** A known start can corroborate a reported count, but cannot be silently
 * contradicted by it. Check at observation time; never increment the count
 * or manufacture a start date from it. */
function reportedCountAgreesWithStarts(property: Property, episode: ResearchEpisode, events: ResearchEvent[], days: number, observedAt: string): boolean {
  const observed = parseResearchDay(observedAt.slice(0, 10));
  if (observed === null) return false;
  const starts: Array<ResearchDate | null> = [];
  if (property.listingDate != null) starts.push({ value: property.listingDate, precision: "day" });
  if (episode.startDate !== null) starts.push(episode.datePrecision === "day" || episode.datePrecision === "month"
    ? { value: episode.datePrecision === "month" ? episode.startDate.slice(0, 7) : episode.startDate, precision: episode.datePrecision }
    : null);
  for (const event of events.filter(event => event.episodeId === episode.id)) {
    if (["paused", "removed", "sold", "relisted"].includes(event.eventType)) return false;
    if (event.eventType === "first_listing" && event.eventDate !== null) starts.push(eventDate(event));
  }
  return starts.every(start => {
    const bounds = start ? researchDateBounds(start) : null;
    if (!bounds) return false;
    const earliest = parseResearchDay(bounds.earliest)!;
    const latest = parseResearchDay(bounds.latest)!;
    return earliest <= observed && days >= Math.max(0, (observed - latest) / DAY) && days <= (observed - earliest) / DAY;
  });
}

/** Resolve chronology by explicit source/listing identity, never by whichever
 * observation is newest. Source-reported elapsed listing time is not active
 * campaign time, calendar time, or the crawler's first observation. */
export function researchListingTime(property: Property, history?: ResearchHistoryResponse): ResearchListingTimeResult {
  const warnings: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const retrievedDay = history ? dayOf(history.retrievedAt) : today;
  const validRetrieval = retrievedDay !== null && retrievedDay <= today;
  const asOf = validRetrieval ? retrievedDay : today;
  const events = (history?.events ?? []).filter((event) => event.propertyId === property.id && event.dataMode === "real")
    .slice().sort((a, b) => eventSortDate(a).localeCompare(eventSortDate(b)) || a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
  const observedFirstSeen = dayOf(property.firstSeenAt);
  const firstSeenAt = property.dataMode === "real" && observedFirstSeen && observedFirstSeen <= asOf ? property.firstSeenAt! : null;
  const finish = (input: {
    latest?: number | null; definition?: string | null; intervals?: ResearchActiveInterval[];
    first?: ResearchDate | null; firstAsking?: number | null; campaignId?: string | null;
    latestSource?: ResearchListingTimeResult["latestEpisodeSource"];
  } = {}): ResearchListingTimeResult => {
    const time = calculateResearchTimeMetrics({ intervals: input.intervals ?? [], asOf,
      latestEpisodeDays: input.latest ?? null, latestEpisodeDefinition: input.definition ?? null,
      firstDocumentedListing: input.first ?? null, firstSeenAt });
    const combined = [...new Set([...warnings, ...time.warnings])];
    return { time: { ...time, warnings: combined }, firstAsking: input.firstAsking ?? null,
      events, campaignId: input.campaignId ?? null, warnings: combined, latestEpisodeSource: input.latestSource ?? null };
  };

  if (property.dataMode !== "real" || property.status !== "active") {
    warnings.push("En aktuel liggetidsreference kræver en aktiv bolig med dokumenteret live-kilde.");
    return finish();
  }
  if (!validRetrieval) {
    warnings.push("Historikkens beregningsdato er ugyldig eller ligger i fremtiden.");
    return finish();
  }
  if (history?.truncated) {
    warnings.push("Historikken er afkortet. Første udbud og samlet aktiv tid kan ikke fastslås fra dette udsnit.");
  }
  const episodes = (history?.episodes ?? []).filter((episode) => episode.propertyId === property.id);
  if (episodes.length === 0) {
    const lifecycleKnown = events.some((event) => ["relisted", "paused", "removed", "sold"].includes(event.eventType));
    if (history?.truncated || lifecycleKnown) {
      warnings.push("Uden dokumenterede perioder kan et tidligere genudbud eller en pause ikke afgrænses.");
      return finish();
    }
    if (!history) warnings.push("Udbudshistorikken er ikke tilgængelig; kun den dokumenterede dato på den aktuelle annonce kan bruges.");
    const date = property.listingDate;
    const observed = dayOf(property.updatedAt) ?? asOf;
    if (!date || parseResearchDay(date) === null || date > asOf || date > observed || observed > asOf) {
      warnings.push("Den aktuelle annonces dokumenterede startdato er ukendt eller ugyldig.");
      return finish();
    }
    return finish({ latest: (parseResearchDay(asOf)! - parseResearchDay(date)!) / DAY,
      definition: `Kalenderdage siden kildens dokumenterede annoncedato (${property.listingSource}); historik om pauser og samlet forløb mangler.` });
  }

  const active = episodes.filter((episode) => episode.dataMode === "real" && episode.status === "active");
  const current = active.filter((episode) => episode.source === property.listingSource && episode.sourceListingId === property.externalId);
  if (current.length !== 1) {
    warnings.push("Den aktuelle udbudsperiode kan ikke knyttes entydigt til annoncens kilde og annonce-id.");
    return finish();
  }
  const latest = current[0]!;
  const activeCampaignIds = new Set(active.map((episode) => episode.campaignId));
  if (activeCampaignIds.size !== 1 || activeCampaignIds.has(null)) {
    warnings.push("Samtidige aktive perioder peger på forskellige eller ukendte salgsforløb; ingen af dem vælges automatisk.");
    return finish();
  }
  const campaign = history!.campaigns.filter((candidate) => candidate.id === latest.campaignId && candidate.propertyId === property.id);
  if (campaign.length !== 1 || campaign[0]!.source !== property.listingSource || !campaign[0]!.linkReason.trim()) {
    warnings.push("Sammenkædningen til det aktuelle salgsforløb mangler dokumentation.");
    return finish();
  }
  const campaignId = campaign[0]!.id;
  const campaignEvents = events.filter((event) => event.campaignId === campaignId);
  const relevant = episodes.filter((episode) => episode.campaignId === campaignId);
  const latestInterval = preciseEpisode(latest, asOf);
  const latestObserved = dayOf(latest.observedAt);
  const impossibleCurrentEpisode = latest.endDate !== null || !latestObserved || latestObserved > asOf ||
    (latest.datePrecision === "day" && latest.startDate !== null &&
      (parseResearchDay(latest.startDate) === null || latest.startDate > latestObserved));
  const conflictingStart = latest.datePrecision === "day" && latest.startDate !== null && property.listingDate !== null && property.listingDate !== latest.startDate;
  const lifecycleConflict = relevant.some((episode) => hasContradictoryLifecycle(episode, campaignEvents, asOf));
  if (conflictingStart || lifecycleConflict || impossibleCurrentEpisode) {
    warnings.push("Annoncens startdato eller status strider mod det dokumenterede periodeforløb. Afklar kilden før beregning.");
    return finish({ campaignId });
  }
  let latestDays = latestInterval ? (parseResearchDay(asOf)! - parseResearchDay(latestInterval.start.value)!) / DAY : null;
  let definition = latestDays !== null
    ? `Forløbne kalenderdage fra præcist dokumenteret start på den aktuelle aktive udbudsperiode (${latest.source}); ikke samlet aktiv tid eller kalendertid for hele salgsforløbet.`
    : null;
  let latestSource: ResearchListingTimeResult["latestEpisodeSource"] = null;
  if (latestDays === null) {
    const reported = reportedListingDuration(property, history);
    const campaignObserved = Date.parse(campaign[0]!.observedAt);
    if (reported && Number.isFinite(campaignObserved) && campaignObserved <= Date.parse(history!.retrievedAt) &&
        reportedCountAgreesWithStarts(property, latest, campaignEvents, reported.days, reported.observedAt)) {
      latestDays = reported.days;
      latestSource = { kind: "source_reported", source: latest.source, observedAt: reported.observedAt };
      definition = `Kildens oplyste liggetid for den aktuelle annonce (${latest.source}), observeret ${reported.observedAt.slice(0, 10)}. Dagetallet bruges uændret; ingen startdato, samlet aktiv tid eller kalendertid udledes.`;
    }
  }
  if (latestDays === null) warnings.push("Starten på den aktuelle udbudsperiode mangler dagpræcision eller gyldig dokumentation; en tidligere annoncedato genbruges ikke.");
  if (history!.truncated) return finish({ latest: latestDays, definition, campaignId, latestSource });
  if (relevant.some((episode) => episode.status === "sold") || campaignEvents.some((event) => event.eventType === "sold")) {
    warnings.push("Det samme salgsforløb indeholder en afsluttet handel og et nyt aktivt udbud. Første pris og samlet tid kræver særskilt sammenkædning af det nye forløb.");
    return finish({ latest: latestDays, definition, campaignId, latestSource });
  }

  const mappedIntervals = relevant.map((episode) => preciseEpisode(episode, asOf));
  const intervals = mappedIntervals.every((interval) => interval !== null) ? mappedIntervals as ResearchActiveInterval[] : [];
  if (intervals.length !== relevant.length) warnings.push("Mindst én periode i salgsforløbet har ukendt start, slutning, status eller kilde. Den udelades ikke fra en tilsyneladende fuldstændig sum.");

  let first: ResearchDate | null = null;
  let firstAsking: number | null = null;
  const firstEvents = campaignEvents.filter((event) => event.eventType === "first_listing");
  const datedFirst = firstEvents.map((event) => ({ event, date: eventDate(event), observed: dayOf(event.observedAt) }));
  const invalidFirst = datedFirst.some(({ date, observed }) => !date || !observed || observed > asOf || researchDateBounds(date)!.earliest > observed);
  if (invalidFirst) warnings.push("En oplysning om første udbud har ukendt eller ugyldig dato; første pris og kalendertid forbliver ukendte.");
  else if (datedFirst.length > 0) {
    datedFirst.sort((a, b) => researchDateBounds(a.date!)!.earliest.localeCompare(researchDateBounds(b.date!)!.earliest));
    const earliest = datedFirst[0]!;
    first = earliest.date;
    const bounds = researchDateBounds(first!)!;
    const overlapping = datedFirst.filter(({ date }) => researchDateBounds(date!)!.earliest <= bounds.latest);
    if (overlapping.some(({ date }) => date!.precision !== "day")) {
      const imprecise = overlapping.find(({ date }) => date!.precision === "month")!;
      first = imprecise.date;
      warnings.push("Første udbud har månedlig præcision; der bruges ingen opdigtet dag eller præcis første pris.");
    } else {
      const firstPrices = overlapping.map(({ event }) => event.price);
      const knownPrices = new Set(firstPrices.filter((price): price is number => price !== null && Number.isFinite(price) && price > 0));
      if (knownPrices.size > 1) warnings.push("Kilderne angiver modstridende første udbudspriser; ingen pris vælges automatisk.");
      else if (knownPrices.size === 1) firstAsking = [...knownPrices][0]!;
    }
    if (relevant.some((episode) => episode.datePrecision === "day" && episode.startDate && parseResearchDay(episode.startDate) !== null && episode.startDate < researchDateBounds(first!)!.earliest)) {
      warnings.push("En dokumenteret periode begynder før den angivne første udbudsdato; første pris og kalendertid kræver afklaring.");
      first = null;
      firstAsking = null;
    }
  }
  return finish({ latest: latestDays, definition, intervals, first, firstAsking, campaignId, latestSource });
}

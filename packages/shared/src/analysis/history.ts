import type { ResearchActiveInterval, ResearchDate, ResearchTimeMetrics } from "./types.js";

const DAY = 86_400_000;

/** Strict calendar parsing avoids JavaScript silently rolling an invalid date into the next month. */
export function parseResearchDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

/** Bounds preserve uncertainty; they are not invented exact observations. */
export function researchDateBounds(date: ResearchDate): { earliest: string; latest: string } | null {
  if (date.precision === "day") return parseResearchDay(date.value) === null ? null : { earliest: date.value, latest: date.value };
  if (date.precision === "month") {
    if (!/^\d{4}-\d{2}$/.test(date.value)) return null;
    const earliest = `${date.value}-01`;
    const stamp = parseResearchDay(earliest);
    if (stamp === null) return null;
    const next = new Date(stamp);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { earliest, latest: new Date(next.getTime() - DAY).toISOString().slice(0, 10) };
  }
  if (!/^\d{4}$/.test(date.value)) return null;
  const earliest = `${date.value}-01-01`;
  return parseResearchDay(earliest) === null ? null : { earliest, latest: `${date.value}-12-31` };
}

/** Elapsed days in the union of half-open [start,end) intervals. Overlaps never count twice. */
export function unionActiveDays(intervals: ResearchActiveInterval[], asOf: string): number | null {
  const observedThrough = parseResearchDay(asOf);
  if (intervals.length === 0 || observedThrough === null) return null;
  const ranges: [number, number][] = [];
  for (const interval of intervals) {
    if (interval.start.precision !== "day" || (interval.end !== null && interval.end.precision !== "day")) return null;
    const start = parseResearchDay(interval.start.value);
    const end = interval.end === null ? observedThrough : parseResearchDay(interval.end.value);
    if (start === null || end === null || start > end || end > observedThrough) return null;
    ranges.push([start, end]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let [start, end] = ranges[0]!;
  let total = 0;
  for (const [nextStart, nextEnd] of ranges.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else { total += end - start; start = nextStart; end = nextEnd; }
  }
  return (total + end - start) / DAY;
}

export function calculateResearchTimeMetrics(input: {
  intervals: ResearchActiveInterval[];
  asOf: string;
  latestEpisodeDays: number | null;
  latestEpisodeDefinition: string | null;
  firstDocumentedListing: ResearchDate | null;
  firstSeenAt: string | null;
}): ResearchTimeMetrics {
  const activeDays = unionActiveDays(input.intervals, input.asOf);
  const asOf = parseResearchDay(input.asOf);
  const first = input.firstDocumentedListing?.precision === "day" ? parseResearchDay(input.firstDocumentedListing.value) : null;
  const calendarDays = first !== null && asOf !== null && asOf >= first ? (asOf - first) / DAY : null;
  const latestEpisodeDays = input.latestEpisodeDays !== null && Number.isFinite(input.latestEpisodeDays) && input.latestEpisodeDays >= 0 ? input.latestEpisodeDays : null;
  const warnings: string[] = [];
  if (activeDays === null) warnings.push("Samlet aktiv liggetid er ukendt; manglende eller upræcise perioder må ikke blive til 0 dage.");
  if (input.firstDocumentedListing && input.firstDocumentedListing.precision !== "day") warnings.push("Første udbud kendes kun med månedlig eller årlig præcision; der beregnes ingen præcis kalendertid.");
  if (latestEpisodeDays !== null && !input.latestEpisodeDefinition) warnings.push("Definitionen af kildens seneste udbudsperiode mangler.");
  return {
    latestEpisodeDays, latestEpisodeDefinition: input.latestEpisodeDefinition, activeDays, calendarDays,
    firstDocumentedListing: input.firstDocumentedListing, firstSeenAt: input.firstSeenAt, warnings,
  };
}

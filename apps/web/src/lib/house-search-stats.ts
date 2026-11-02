import type { HouseSearchEntry, HouseSearchStatus } from "@shared/types/house-search";

/** Entries rated this high count as "we really liked it" when looking for a pattern. */
export const LIKED_RATING = 4;
/** Fewer liked entries than this is anecdote, not a preference. The UI asks for more ratings instead. */
export const MIN_LIKED_FOR_PREFERENCE = 3;

export interface Range {
  /** 25th percentile. */
  low: number;
  median: number;
  /** 75th percentile. */
  high: number;
}

export interface PriceBand { from: number; to: number; count: number }
export interface PostalStat { postalCode: string; count: number; medianPrice: number | null }
export interface MonthStat { month: string; count: number }

export interface HouseSearchStats {
  total: number;
  withPrice: number;
  withRooms: number;
  withLocation: number;
  price: { min: number; max: number; median: number } | null;
  medianRooms: number | null;
  byStatus: Record<HouseSearchStatus, number>;
  priceBands: PriceBand[];
  roomsDistribution: { rooms: number; count: number }[];
  byPostalCode: PostalStat[];
  byMonth: MonthStat[];
  /** Entries rated 4 or 5 and not rejected. Drives the sweet spot and the "rate more" hint. */
  likedCount: number;
  /** The middle half of what was rated highly. Null until there are enough liked entries. */
  sweetSpot: { count: number; price: Range | null; rooms: Range | null; topPostalCode: string | null } | null;
  /** How rejected listings differ from the ones kept. Null unless both groups exist. */
  rejectedVsKept: { rejected: GroupStat; kept: GroupStat } | null;
}

export interface GroupStat { count: number; medianPrice: number | null; medianRooms: number | null }

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Linear-interpolated percentile (0 to 1) of an unsorted list. Null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = sorted(values);
  const index = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return s[lower]! + (s[upper]! - s[lower]!) * (index - lower);
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

function range(values: number[]): Range | null {
  const low = percentile(values, 0.25);
  const mid = percentile(values, 0.5);
  const high = percentile(values, 0.75);
  return low === null || mid === null || high === null ? null : { low, median: mid, high };
}

function present(values: Array<number | null>): number[] {
  return values.filter((v): v is number => v !== null);
}

/** Band width scales with the spread so a 1.5M and a 12M search both give 4 to 12 readable bars. */
export function priceBandWidth(min: number, max: number): number {
  const spread = max - min;
  if (spread <= 2_000_000) return 250_000;
  if (spread <= 6_000_000) return 500_000;
  return 1_000_000;
}

function priceBands(prices: number[]): PriceBand[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = priceBandWidth(min, max);
  const start = Math.floor(min / width) * width;
  const bands: PriceBand[] = [];
  for (let from = start; from <= max; from += width) bands.push({ from, to: from + width, count: 0 });
  for (const price of prices) bands[Math.min(bands.length - 1, Math.floor((price - start) / width))]!.count += 1;
  return bands;
}

function group(entries: HouseSearchEntry[]): GroupStat {
  return {
    count: entries.length,
    medianPrice: median(present(entries.map((e) => e.askingPriceDkk))),
    medianRooms: median(present(entries.map((e) => e.rooms))),
  };
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) if (count > bestCount) { best = value; bestCount = count; }
  return best;
}

export function summarize(entries: HouseSearchEntry[]): HouseSearchStats {
  const prices = present(entries.map((e) => e.askingPriceDkk));
  const rooms = present(entries.map((e) => e.rooms));

  const byStatus: Record<HouseSearchStatus, number> = { interested: 0, visited: 0, rejected: 0 };
  for (const e of entries) byStatus[e.status] += 1;

  const roomCounts = new Map<number, number>();
  for (const r of rooms) roomCounts.set(r, (roomCounts.get(r) ?? 0) + 1);

  const postal = new Map<string, HouseSearchEntry[]>();
  for (const e of entries) if (e.postalCode) postal.set(e.postalCode, [...(postal.get(e.postalCode) ?? []), e]);

  const months = new Map<string, number>();
  for (const e of entries) months.set(e.seenAt.slice(0, 7), (months.get(e.seenAt.slice(0, 7)) ?? 0) + 1);

  const liked = entries.filter((e) => e.rating !== null && e.rating >= LIKED_RATING && e.status !== "rejected");
  const rejected = entries.filter((e) => e.status === "rejected");
  const kept = entries.filter((e) => e.status !== "rejected");

  return {
    total: entries.length,
    withPrice: prices.length,
    withRooms: rooms.length,
    withLocation: entries.filter((e) => e.lat !== null && e.lon !== null).length,
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices), median: median(prices)! } : null,
    medianRooms: median(rooms),
    byStatus,
    priceBands: priceBands(prices),
    roomsDistribution: [...roomCounts].map(([r, count]) => ({ rooms: r, count })).sort((a, b) => a.rooms - b.rooms),
    byPostalCode: [...postal]
      .map(([postalCode, list]) => ({ postalCode, count: list.length, medianPrice: median(present(list.map((e) => e.askingPriceDkk))) }))
      .sort((a, b) => b.count - a.count || a.postalCode.localeCompare(b.postalCode)),
    byMonth: [...months].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
    likedCount: liked.length,
    sweetSpot:
      liked.length >= MIN_LIKED_FOR_PREFERENCE
        ? {
            count: liked.length,
            price: range(present(liked.map((e) => e.askingPriceDkk))),
            rooms: range(present(liked.map((e) => e.rooms))),
            topPostalCode: mostCommon(liked.flatMap((e) => (e.postalCode ? [e.postalCode] : []))),
          }
        : null,
    rejectedVsKept: rejected.length > 0 && kept.length > 0 ? { rejected: group(rejected), kept: group(kept) } : null,
  };
}

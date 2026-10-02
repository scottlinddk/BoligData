export interface MarketIndexPoint { month: string; value: number | null }
export interface MarketComparisonMonth { month: string; country: number | null; municipality: number | null }
export interface ChartPoint { index: number; month: string; value: number }

/** Align by calendar month, keeping absent observations visibly missing. */
export function compareMarketMonths(country: MarketIndexPoint[], municipality: MarketIndexPoint[] = []): MarketComparisonMonth[] {
  const national = new Map(country.map(point => [point.month, point.value]));
  const local = new Map(municipality.map(point => [point.month, point.value]));
  const months = [...new Set([...national.keys(), ...local.keys()])].sort();
  if (!months.length) return [];
  const first = months[0]!, last = months[months.length - 1]!;
  const result: MarketComparisonMonth[] = [];
  let [year, month] = first.split("-").map(Number) as [number, number];
  while (true) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    result.push({ month: key, country: national.get(key) ?? null, municipality: local.get(key) ?? null });
    if (month === 12) { year++; month = 1; } else month++;
  }
  return result;
}

/** Separate paths prevent the chart from implying a value across a data gap. */
export function marketChartSegments(rows: MarketComparisonMonth[], field: "country" | "municipality"): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let segment: ChartPoint[] = [];
  rows.forEach((row, index) => {
    const value = row[field];
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ index, month: row.month, value });
  });
  if (segment.length) segments.push(segment);
  return segments;
}

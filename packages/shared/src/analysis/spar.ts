/**
 * Own SPAR price index (sale price relative to the public valuation), modelled on Danmarks
 * Statistik's method: free-trade sales only, købsaftale date, afstandsprocent trim 0.4 to 4,
 * value-weighted ratio of sums, chained when the valuation vintage changes.
 *
 * With only a few sales per month a raw monthly ratio is noise, so `localLevelIndex` smooths
 * log ratios with a local-level Kalman model and returns intervals. Everything here is pure
 * and takes the as-of date explicitly, so backtests cannot see valuations registered later.
 */

export const SPAR_MIN_RATIO = 0.4;
export const SPAR_MAX_RATIO = 4;
/** DST publishes final figures 13 months after the reference period. */
export const SPAR_FINAL_AFTER_MONTHS = 13;
const Z80 = 1.2815515655446004;
const Z95 = 1.959963984540054;

export type SparBfeType = "SFE" | "EL" | "BPFG";

export interface SparSale {
  id: string;
  /** Købsaftale date, YYYY-MM-DD. Never the registration or overtagelse date. */
  agreementDate: string;
  price: number;
  /** Public valuation (ejendomsværdi) the price is related to. */
  valuation: number;
  /** Almindelig fri handel. Family transfers, part gifts, public sellers and bulk sales are false. */
  freeTrade: boolean;
}

export interface SparValuation {
  bfe: string;
  bfeType: SparBfeType | null;
  valuationYear: number;
  value: number;
  /** When the valuation was known. Null means unknown, so it is unusable for a backtest. */
  registeredAt: string | null;
}

export interface TrimResult {
  kept: SparSale[];
  excluded: { notFreeTrade: number; invalid: number; extreme: number };
}

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const positive = (n: number) => Number.isFinite(n) && n > 0;

/** DST rules: free trade only, then drop afstandsprocent below 0.4 or above 4. */
export function trimSparSales(sales: SparSale[]): TrimResult {
  const excluded = { notFreeTrade: 0, invalid: 0, extreme: 0 };
  const kept: SparSale[] = [];
  for (const sale of sales) {
    if (!sale.freeTrade) { excluded.notFreeTrade++; continue; }
    if (!positive(sale.price) || !positive(sale.valuation) || !isDay(sale.agreementDate)) { excluded.invalid++; continue; }
    const ratio = sale.price / sale.valuation;
    if (ratio < SPAR_MIN_RATIO || ratio > SPAR_MAX_RATIO) { excluded.extreme++; continue; }
    kept.push(sale);
  }
  return { kept, excluded };
}

export type SparGranularity = "month" | "quarter";

/** "2024-03" for months, "2024-Q1" for quarters. */
export function sparPeriod(day: string, granularity: SparGranularity): string {
  const [year, month] = day.split("-");
  return granularity === "month" ? `${year}-${month}` : `${year}-Q${Math.ceil(Number(month) / 3)}`;
}

/** Value-weighted: sum of prices over sum of valuations. */
export function ratioOfSums(sales: SparSale[]): number | null {
  if (sales.length === 0) return null;
  let price = 0, valuation = 0;
  for (const s of sales) { price += s.price; valuation += s.valuation; }
  return valuation > 0 ? price / valuation : null;
}

export interface SparPeriodPoint {
  period: string;
  ratio: number | null;
  n: number;
}

/** Trimmed ratio of sums per period, with empty periods between the first and last kept. */
export function sparSeries(sales: SparSale[], granularity: SparGranularity): SparPeriodPoint[] {
  const groups = new Map<string, SparSale[]>();
  for (const s of trimSparSales(sales).kept) {
    const key = sparPeriod(s.agreementDate, granularity);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }
  const keys = [...groups.keys()].sort();
  if (keys.length === 0) return [];
  return enumeratePeriods(keys[0]!, keys[keys.length - 1]!, granularity).map((period) => {
    const g = groups.get(period) ?? [];
    return { period, ratio: ratioOfSums(g), n: g.length };
  });
}

export function enumeratePeriods(first: string, last: string, granularity: SparGranularity): string[] {
  const parse = (p: string) => {
    const [y, rest] = p.split("-") as [string, string];
    return Number(y) * 12 + (granularity === "month" ? Number(rest) - 1 : (Number(rest.slice(1)) - 1) * 3);
  };
  const step = granularity === "month" ? 1 : 3;
  const out: string[] = [];
  for (let i = parse(first); i <= parse(last); i += step) {
    const year = Math.floor(i / 12), m = (i % 12) + 1;
    out.push(granularity === "month" ? `${year}-${String(m).padStart(2, "0")}` : `${year}-Q${Math.ceil(m / 3)}`);
  }
  return out;
}

/**
 * Months between a period and the as-of date; a period is final once it is at least 13 months old.
 * For quarters the end of the quarter counts.
 */
export function isPreliminary(period: string, asOf: string, granularity: SparGranularity): boolean {
  const [y, rest] = period.split("-") as [string, string];
  const endMonth = granularity === "month" ? Number(rest) : Number(rest.slice(1)) * 3;
  const [ay, am] = asOf.split("-").map(Number) as [number, number];
  return (ay * 12 + am) - (Number(y) * 12 + endMonth) < SPAR_FINAL_AFTER_MONTHS;
}

/**
 * Pick the valuation to relate a sale to.
 * - Only rows whose BFE type fits the property (apartments use their own EL BFE, never the SFE).
 * - Look-ahead guard: registeredAt must be known and not after `asOf`.
 * - `vintage` fixes a valuation year (index construction); without it the latest year known at
 *   `asOf` wins (live fair-price estimate).
 */
export function selectValuation(
  valuations: SparValuation[],
  opts: { asOf: string; isUnit: boolean; vintage?: number },
): SparValuation | null {
  const wanted: SparBfeType = opts.isUnit ? "EL" : "SFE";
  const usable = valuations.filter((v) =>
    v.bfeType === wanted && positive(v.value) && v.registeredAt !== null && v.registeredAt.slice(0, 10) <= opts.asOf &&
    (opts.vintage === undefined || v.valuationYear === opts.vintage));
  if (usable.length === 0) return null;
  return usable.reduce((best, v) =>
    v.valuationYear > best.valuationYear || (v.valuationYear === best.valuationYear && (v.registeredAt ?? "") > (best.registeredAt ?? "")) ? v : best);
}

/**
 * Chain two vintages the way DST does. `older` and `newer` hold the SAME sales related to the
 * old and the new valuation. Periods where both exist overlap; the newer series is rescaled by the
 * sale-weighted geometric mean ratio over the overlap, then used from `switchPeriod` onwards.
 * Returns null when there is no overlap, since a chain without one would be a guess.
 */
export function chainVintages(older: SparPeriodPoint[], newer: SparPeriodPoint[], switchPeriod: string): SparPeriodPoint[] | null {
  const newerBy = new Map(newer.map((p) => [p.period, p]));
  let weight = 0, sum = 0;
  for (const o of older) {
    const n = newerBy.get(o.period);
    if (!n || o.ratio === null || n.ratio === null || o.n === 0) continue;
    weight += o.n;
    sum += o.n * (Math.log(o.ratio) - Math.log(n.ratio));
  }
  if (weight === 0) return null;
  const factor = Math.exp(sum / weight);
  const periods = [...new Set([...older.map((p) => p.period), ...newer.map((p) => p.period)])].sort();
  const olderBy = new Map(older.map((p) => [p.period, p]));
  return periods.map((period) => {
    const useNew = period >= switchPeriod;
    const p = (useNew ? newerBy : olderBy).get(period);
    return { period, ratio: p?.ratio == null ? null : useNew ? p.ratio * factor : p.ratio, n: p?.n ?? 0 };
  });
}

/* ------------------------------------------------------------ local level */

export interface LocalLevelPoint {
  period: string;
  /** Index level in ratio units (exp of the smoothed log level). */
  estimate: number;
  lo80: number; hi80: number; lo95: number; hi95: number;
  /** Standard error of the smoothed log level. */
  se: number;
  n: number;
  preliminary: boolean;
}

export interface LocalLevelOptions {
  granularity: SparGranularity;
  /** Used for the preliminary flag and the late-period interval inflation. */
  asOf: string;
  /** Level innovation variance per period. Estimated by maximum likelihood when omitted. */
  levelVariance?: number;
  /** Variance of one sale's log ratio around the level. Estimated from the data when omitted. */
  saleVariance?: number;
}

interface KalmanState { filtM: number[]; filtP: number[]; predM: number[]; predP: number[]; logLik: number }

function kalman(y: (number | null)[], r: number[], q: number, m0: number, p0: number): KalmanState {
  const filtM: number[] = [], filtP: number[] = [], predM: number[] = [], predP: number[] = [];
  let m = m0, p = p0, logLik = 0;
  for (let t = 0; t < y.length; t++) {
    const pm = m, pp = p + (t === 0 ? 0 : q);
    predM.push(pm); predP.push(pp);
    const obs = y[t];
    if (obs == null) { m = pm; p = pp; }
    else {
      const s = pp + r[t]!, k = pp / s, e = obs - pm;
      m = pm + k * e; p = (1 - k) * pp;
      logLik += -0.5 * (Math.log(2 * Math.PI * s) + (e * e) / s);
    }
    filtM.push(m); filtP.push(p);
  }
  return { filtM, filtP, predM, predP, logLik };
}

/** Pooled within-period variance of individual log ratios, floored so thin data stays honest. */
function pooledSaleVariance(sales: SparSale[], granularity: SparGranularity): number {
  const groups = new Map<string, number[]>();
  for (const s of sales) (groups.get(sparPeriod(s.agreementDate, granularity)) ?? groups.set(sparPeriod(s.agreementDate, granularity), []).get(sparPeriod(s.agreementDate, granularity))!).push(Math.log(s.price / s.valuation));
  let ss = 0, df = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    ss += g.reduce((a, b) => a + (b - mean) ** 2, 0);
    df += g.length - 1;
  }
  if (df >= 5) return Math.max(ss / df, 0.01);
  // Too few repeat observations within a period: fall back to the overall spread.
  const all = sales.map((s) => Math.log(s.price / s.valuation));
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const v = all.length > 1 ? all.reduce((a, b) => a + (b - mean) ** 2, 0) / (all.length - 1) : 0.04;
  return Math.max(v, 0.01);
}

/**
 * Local-level model on the log of each sale's price/valuation ratio:
 *   level[t] = level[t-1] + eta,  eta ~ N(0, q);  y[t] = level[t] + eps / sqrt(n[t]).
 * Empty periods are handled by the filter. Intervals are for the level (the index), not for a
 * single property. The last 3 periods are inflated, because late registrations skew them cheap.
 * Returns an empty list when fewer than 2 sales remain after trimming.
 */
export function localLevelIndex(sales: SparSale[], opts: LocalLevelOptions): LocalLevelPoint[] {
  const kept = trimSparSales(sales).kept;
  if (kept.length < 2) return [];
  const sigma2 = opts.saleVariance ?? pooledSaleVariance(kept, opts.granularity);
  const groups = new Map<string, number[]>();
  for (const s of kept) {
    const k = sparPeriod(s.agreementDate, opts.granularity);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(Math.log(s.price / s.valuation));
  }
  const keys = [...groups.keys()].sort();
  const periods = enumeratePeriods(keys[0]!, keys[keys.length - 1]!, opts.granularity);
  const y = periods.map((p) => { const g = groups.get(p); return g ? g.reduce((a, b) => a + b, 0) / g.length : null; });
  const n = periods.map((p) => groups.get(p)?.length ?? 0);
  const r = n.map((c) => (c > 0 ? sigma2 / c : sigma2));
  const first = y.find((v) => v != null)!;
  const p0 = 1; // diffuse prior around the first observation

  let q = opts.levelVariance;
  if (q === undefined) {
    let best = -Infinity;
    for (let e = -8; e <= -1; e += 0.25) {
      const cand = 10 ** e;
      const ll = kalman(y, r, cand, first, p0).logLik;
      if (ll > best) { best = ll; q = cand; }
    }
  }
  const qq = q!;
  const f = kalman(y, r, qq, first, p0);
  // Rauch-Tung-Striebel smoother.
  const T = periods.length;
  const sm = new Array<number>(T), sp = new Array<number>(T);
  sm[T - 1] = f.filtM[T - 1]!; sp[T - 1] = f.filtP[T - 1]!;
  for (let t = T - 2; t >= 0; t--) {
    const g = f.filtP[t]! / (f.filtP[t]! + qq);
    sm[t] = f.filtM[t]! + g * (sm[t + 1]! - f.filtM[t]! );
    sp[t] = f.filtP[t]! + g * g * (sp[t + 1]! - (f.filtP[t]! + qq));
  }
  return periods.map((period, t) => {
    const preliminary = isPreliminary(period, opts.asOf, opts.granularity);
    const late = T - 1 - t < 3 ? 1.5 : 1; // widen the three newest periods
    const se = Math.sqrt(Math.max(sp[t]!, 0)) * late;
    const level = sm[t]!;
    return {
      period, n: n[t]!, preliminary, se,
      estimate: Math.exp(level),
      lo80: Math.exp(level - Z80 * se), hi80: Math.exp(level + Z80 * se),
      lo95: Math.exp(level - Z95 * se), hi95: Math.exp(level + Z95 * se),
    };
  });
}

/* ------------------------------------------------------------ DST check */

export interface DstComparison {
  periods: number;
  /** Mean absolute difference in period-on-period log change, in percentage points. */
  meanAbsDiffPct: number | null;
  correlation: number | null;
  /** Share of periods where DST's change lies inside our 80% interval for the change. */
  coverage80: number | null;
}

/**
 * Compare changes, not levels (levels differ by base vintage and the valuation deduction).
 * `dst` must hold final figures only. The interval for our change uses the two levels'
 * standard errors as if independent, which is conservative (wider) for a smoothed series.
 */
export function compareWithDst(own: LocalLevelPoint[], dst: Map<string, number>): DstComparison {
  const diffs: { ours: number; theirs: number; se: number }[] = [];
  for (let i = 1; i < own.length; i++) {
    const a = own[i - 1]!, b = own[i]!;
    const d0 = dst.get(a.period), d1 = dst.get(b.period);
    if (d0 === undefined || d1 === undefined || !positive(d0) || !positive(d1)) continue;
    diffs.push({ ours: Math.log(b.estimate / a.estimate), theirs: Math.log(d1 / d0), se: Math.hypot(a.se, b.se) });
  }
  if (diffs.length === 0) return { periods: 0, meanAbsDiffPct: null, correlation: null, coverage80: null };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const xs = diffs.map((d) => d.ours), ys = diffs.map((d) => d.theirs);
  const mx = mean(xs), my = mean(ys);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0);
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), syy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  return {
    periods: diffs.length,
    meanAbsDiffPct: mean(diffs.map((d) => Math.abs(d.ours - d.theirs))) * 100,
    correlation: diffs.length >= 3 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null,
    coverage80: mean(diffs.map((d) => (Math.abs(d.theirs - d.ours) <= Z80 * d.se ? 1 : 0))),
  };
}

/**
 * Fair price = valuation x smoothed ratio x exp(adjustment). The band is the index uncertainty
 * only. Add the single-property residual spread (measured in a backtest) before showing it.
 */
export function fairPrice(valuation: number, point: Pick<LocalLevelPoint, "estimate" | "se">, adjustmentLog = 0, residualSd = 0) {
  if (!positive(valuation)) return null;
  const centre = Math.log(valuation * point.estimate) + adjustmentLog;
  const se = Math.hypot(point.se, residualSd);
  return { estimate: Math.exp(centre), lo80: Math.exp(centre - Z80 * se), hi80: Math.exp(centre + Z80 * se), lo95: Math.exp(centre - Z95 * se), hi95: Math.exp(centre + Z95 * se) };
}

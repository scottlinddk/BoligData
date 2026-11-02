import {
  hedonicResults,
  minRelativeImprovement,
  type HedonicMethod,
  type HedonicResults,
  type HedonicSegment,
  type SegmentMethodRow,
} from "@shared/analysis/hedonic-results";

/** Visningsmodel for fanen "Analyse". Ren: alle tal kommer fra den genererede resultatfil. Teksten er dansk. */

export const SEGMENT_LABEL: Record<HedonicSegment, string> = { house: "Huse", apartment: "Lejligheder" };
export const SEGMENT_NOTE: Record<HedonicSegment, string> = {
  house: "Villa, rækkehus og villalejlighed",
  apartment: "Ejerlejligheder",
};
export const METHOD_SHORT: Record<HedonicMethod, string> = {
  a1: "A1 Median kr./m²",
  a2: "A2 /stats-indeks × m²",
  b: "B Vurdering × salg/vurdering",
  ridge: "Ridge (log-lineær)",
  gbm: "Gradient boosting",
};
export const METHOD_ORDER: HedonicMethod[] = ["a1", "a2", "b", "ridge", "gbm"];

const nf = (digits: number) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const n0 = nf(0);
const n1 = nf(1);
const n2 = nf(2);

export const fmt = {
  int: (v: number | null | undefined) => (v === null || v === undefined ? "-" : n0.format(v)),
  /** Andel som procent, f.eks. 0.155 -> "15,5 %". */
  pct: (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${n1.format(v * 100)} %`),
  /** Med fortegn. Bruges til bias, som er en procentvis afvigelse. */
  signedPct: (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${n1.format(Math.abs(v) * 100)} %`),
  /** Forskel mellem to procenter måles i procentpoint, ikke procent. */
  signedPp: (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${n1.format(Math.abs(v) * 100)} pp`),
  dec2: (v: number | null | undefined) => (v === null || v === undefined ? "-" : n2.format(v)),
  mio: (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${n2.format(v / 1e6)} mio.`),
  range: (r: [number, number] | null | undefined) => (r ? `${n0.format(r[0] * 100)}-${n0.format(r[1] * 100)} %` : "-"),
};

export function rowFor(rows: SegmentMethodRow[], segment: HedonicSegment, method: HedonicMethod): SegmentMethodRow | undefined {
  return rows.find((r) => r.segment === segment && r.method === method);
}

export type EvidenceGrade = "meget svag" | "svag" | "moderat";

export interface Headline {
  segment: HedonicSegment;
  recommended: HedonicMethod;
  bestBaseline: HedonicMethod;
  rolling: SegmentMethodRow;
  holdout: SegmentMethodRow | undefined;
  /** Forholdet mellem fejlen på det urørte testsæt og i rolling-origin. */
  holdoutRatio: number | null;
  evidence: EvidenceGrade;
  evidenceWhy: string;
  reason: string;
}

/**
 * Evidensstyrke efter en enkel, synlig regel: er der færre end 10 handler i det urørte testsæt, er der ingen brugbar
 * out-of-time kontrol ("meget svag"). Er fejlen dér over 1,5 gange rolling-fejlen, holder resultatet ikke ud i det
 * nyeste tidsrum ("svag"). Ellers "moderat". Reglen er et skøn og ikke en statistisk test.
 */
export function buildHeadline(r: HedonicResults, segment: HedonicSegment): Headline | null {
  const d = r.dev.decision[segment];
  if (!d?.recommended) return null;
  const rolling = rowFor(r.dev.rolling.pooled, segment, d.recommended);
  if (!rolling) return null;
  const holdout = rowFor(r.final.summary, segment, d.recommended);
  const ratio = holdout?.mdape != null && rolling.mdape ? holdout.mdape / rolling.mdape : null;
  let evidence: EvidenceGrade;
  let why: string;
  if (!holdout || holdout.n < 10) {
    evidence = "meget svag";
    why = `Kun ${holdout?.n ?? 0} handler i det urørte testsæt, så der er ingen brugbar kontrol på det nyeste tidsrum.`;
  } else if (ratio !== null && ratio > 1.5) {
    evidence = "svag";
    why = `Fejlen på det urørte testsæt (${fmt.pct(holdout.mdape)}, n=${holdout.n}) er ${fmt.dec2(ratio)} gange fejlen i rolling-origin (${fmt.pct(rolling.mdape)}).`;
  } else {
    evidence = "moderat";
    why = "Fejlen på det urørte testsæt ligger tæt på fejlen i rolling-origin.";
  }
  const need = minRelativeImprovement(r) ?? 0.1;
  const reason =
    d.recommended === d.best_baseline
      ? `Ingen challenger slår ${METHOD_SHORT[d.best_baseline]} med mindst ${fmt.int(need * 100)} % i MdAPE med et bootstrap-interval helt under 0. Baseline anbefales.`
      : `${METHOD_SHORT[d.recommended]} slår ${METHOD_SHORT[d.best_baseline]} med mindst ${fmt.int(need * 100)} % i MdAPE, og bootstrap-intervallet ligger helt under 0.`;
  return { segment, recommended: d.recommended, bestBaseline: d.best_baseline, rolling, holdout, holdoutRatio: ratio, evidence, evidenceWhy: why, reason };
}

export const hedonicView = {
  results: hedonicResults,
  headline: (segment: HedonicSegment) => buildHeadline(hedonicResults, segment),
};

import type { ConditionEvidenceInput, ConditionSignal, ResearchConditionEvidence } from "./types.js";
import { parseResearchDay } from "./history.js";

export const CONDITION_METHOD_VERSION = "da-condition-rules/1.0";

/** Text clues, never a diagnosis or a renovation price estimate. Evidence stays in its listing episode. */
export function classifyConditionEvidence(input: ConditionEvidenceInput): ResearchConditionEvidence {
  const excerpts: ResearchConditionEvidence["excerpts"] = [];
  const add = (signal: ConditionSignal, text: string) => {
    if (!excerpts.some((entry) => entry.signal === signal && entry.text === text)) excerpts.push({ signal, text });
  };
  const clauses = (input.text ?? "").split(/(?<=[.!?;\n])\s*|,?\s+men\s+/i).map((value) => value.trim()).filter(Boolean);
  for (const clause of clauses) {
    if (/dødsbo/i.test(clause)) add("estate", clause);
    if (/nedrivning|nedrivningsmoden|byggegrund/i.test(clause)) add("demolition", clause);
    if (/sæt(?:te)? (?:dit |jeres |sit )?eget præg|potentiale|muligheder/i.test(clause)) add("weak_potential", clause);
    const withoutNegatedNeed = clause.replace(/kræver\s+(?:ikke|ingen)\s+(?:en\s+)?(?:total)?(?:renovering|modernisering|istandsættelse)|(?:skal|bør)\s+ikke\s+(?:udskiftes|renoveres|repareres)/gi, "");
    if (/kræver[^.!?]{0,50}(?:renovering|modernisering|istandsættelse)|(?:skal|bør)[^.!?]{0,35}(?:udskiftes|renoveres|repareres)|trænger (?:til|en)[^.!?]{0,40}(?:renovering|modernisering|istandsættelse)/i.test(withoutNegatedNeed)) add("needs_work", clause);
    const negatedRenovation = /(?:ikke|aldrig)\s+(?:(?:blevet|været)\s+)?(?:total)?(?:renoveret|moderniseret)/i.test(clause);
    if (negatedRenovation || /oprindelig(?:e|t)?\s+(?:stand|køkken|badeværelse)|står[^.!?]{0,20}(?:originalt|oprindeligt)|moderniseringsbehov/i.test(clause)) add("original_condition", clause);
    const withoutNegated = clause.replace(/(?:ikke|aldrig)\s+(?:(?:blevet|været)\s+)?(?:total)?(?:renoveret|moderniseret)/gi, "");
    if (/\b(?:totalrenoveret|gennemrenoveret|nyrenoveret|renoveret|moderniseret)\b|\bnyt (?:køkken|tag|bad)|\bnye (?:vinduer|gulve)/i.test(withoutNegated)) add("completed_work", clause);
    if (/indflytningsklar|lige til at flytte ind|klar til indflytning/i.test(clause) && !/(?:ikke|langt fra)\s+indflytningsklar/i.test(clause)) add("move_in_ready", clause);
  }
  const signals: ConditionSignal[] = [...new Set(excerpts.map((entry) => entry.signal))];
  if (!signals.length) signals.push("unknown");
  const sale = input.saleDate ? parseResearchDay(input.saleDate.slice(0, 10)) : null;
  const valid = input.validAt ? parseResearchDay(input.validAt.slice(0, 10)) : null;
  const observed = parseResearchDay(input.observedAt.slice(0, 10));
  const historicalAssociation = sale === null || valid === null || !input.listingEpisodeId || observed === null || valid > observed
    ? "unverified" : valid > sale ? "after_sale" : "eligible";
  return { ...input, signals, excerpts, method: "danish_text_rules", methodVersion: CONDITION_METHOD_VERSION, historicalAssociation };
}

export function matchesStrictRenovation(evidence: ResearchConditionEvidence | null): boolean {
  return !!evidence && evidence.historicalAssociation === "eligible" &&
    evidence.signals.some((signal) => signal === "needs_work" || signal === "original_condition") &&
    !evidence.signals.some((signal) => signal === "completed_work" || signal === "move_in_ready");
}

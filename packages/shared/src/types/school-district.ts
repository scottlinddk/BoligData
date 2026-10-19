export interface SchoolDistrictMatch {
  schoolName: string;
  schoolUrl: string | null;
  firstGrade: number | null;
  lastGrade: number | null;
}

/**
 * Which upstream answered. LIFA AdresseService is the municipalities' own
 * district register; Skoledistrikt.dk is a third-party view of the same data
 * and is only used when LIFA gives no verified answer.
 */
export type SchoolDistrictProvider = "lifa" | "skoledistrikt";

/** A district is an advisory address match, never a nearest-school estimate. */
export interface SchoolDistrictResult {
  status: "available" | "not_found" | "unavailable";
  reason: "address_missing" | "address_ambiguous" | "address_mismatch" | "upstream_unavailable" | "invalid_response" | "nonlive_data" | null;
  /** DAR Husnummer UUID, as accepted by the source's own address picker. */
  addressId: string | null;
  address: string | null;
  municipality: string | null;
  matches: SchoolDistrictMatch[];
  confidence: "high" | "medium" | "low" | "unknown";
  /** Null when no upstream was called (e.g. demo listing or unparseable address). */
  provider: SchoolDistrictProvider | null;
  /** Upstream origin/cache label, e.g. CACHE. It is not our verification status. */
  source: string | null;
  sourceUrl: string;
  checkedAt: string;
  disclaimer: string | null;
}

export interface SchoolDistrictMatch {
  schoolName: string;
  schoolUrl: string | null;
  firstGrade: number | null;
  lastGrade: number | null;
}

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
  /** Upstream origin/cache label, e.g. CACHE. It is not our verification status. */
  source: string | null;
  sourceUrl: string;
  checkedAt: string;
  disclaimer: string | null;
}

/**
 * Municipal spildevandsplaner (wastewater plans, which cover sewer
 * separation requirements) have no unified national API — each of Denmark's
 * ~98 municipalities publishes independently (WFS, PDF, or a page on their
 * own site), so a single automated true/false isn't realistic across the
 * country. This stays a pure derivation, like tinglysning-link.ts: a deep
 * link the advisor can follow themselves, scoped to the municipalities
 * within the crawl's current postal-code ranges (CRAWL_ZIP_RANGES, default
 * 9000-9900, Region Nordjylland) rather than an empty/unhelpful "not supported"
 * everywhere else.
 *
 * URLs point at each municipality's own domain root — not a page-level deep
 * link into their spildevandsplan, since page paths aren't standardized and
 * weren't individually verified this session. Confirm/replace with the
 * specific spildevandsplan page per municipality when available.
 */
const MUNICIPALITY_URLS: Record<string, string> = {
  Aalborg: "https://www.aalborg.dk/",
  "Brønderslev": "https://www.bronderslev.dk/",
  Frederikshavn: "https://www.frederikshavn.dk/",
  "Hjørring": "https://hjoerring.dk/",
  Jammerbugt: "https://www.jammerbugt.dk/",
  "Læsø": "https://www.laesoe.dk/",
  Mariagerfjord: "https://www.mariagerfjord.dk/",
  "Morsø": "https://www.morsoe.dk/",
  Rebild: "https://www.rebild.dk/",
  Thisted: "https://thisted.dk/",
  Vesthimmerland: "https://www.vesthimmerland.dk/",
};

/** Pure lookup, no network call — mirrors buildTinglysningUrl's shape. */
export function buildSpildevandsplanUrl(municipality: string): string | null {
  return MUNICIPALITY_URLS[municipality] ?? null;
}

import type { BbrData, PublicValuation, SoldPriceEntry, ZoneStatus } from "@shared/types/index";
import type { NearbySaleEntry, PropertyLookupResult } from "@shared/types/property-lookup";
import type { SparListingEstimate } from "@shared/types/spar";
import { summarizeLookupSources, type SourceSummaryEntry } from "@/lib/property-facts";

/**
 * What the address page may show for a home that is not a listing.
 *
 * There is no stored listing row to fall back on, so the rule from the
 * property page is applied in its strictest form: a group of values is shown
 * only when its own register answered live. A mock or unavailable source yields
 * `null`/`[]` rather than a figure under a "live" badge, and `sources` says why.
 */
export interface AddressReport {
  address: string;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  bbrData: BbrData | null;
  publicValuation: PublicValuation | null;
  zone: ZoneStatus | null;
  matrikelnr: string | null;
  ejerlav: string | null;
  bfeNummer: string | null;
  priceHistory: SoldPriceEntry[];
  nearbySales: NearbySaleEntry[];
  /**
   * Fair-price estimate, computed on the server from live register data only. `null` means it was attempted and
   * failed, `undefined` that this lookup did not ask for one. It is passed through even when the valuation source
   * is not live, since "not a house" and "no valuation" are answers worth showing.
   */
  spar: SparListingEstimate | null | undefined;
  sources: SourceSummaryEntry[];
  mapUrl: string | null;
}

function isLive(lookup: PropertyLookupResult, key: PropertyLookupResult["sources"][number]["key"]): boolean {
  return lookup.sources.some((source) => source.key === key && source.mode === "live");
}

function hasAnyValue(record: object | null): boolean {
  return record !== null && Object.values(record).some((value) => value !== null);
}

export function openStreetMapUrl(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`;
}

export function buildAddressReport(lookup: PropertyLookupResult): AddressReport {
  const addressLive = isLive(lookup, "address");
  // The lookup echoes the caller's energy label into bbrData; it is not a register observation.
  const bbr = isLive(lookup, "bbr") && lookup.bbrData ? { ...lookup.bbrData, energyLabel: null } : null;
  const valuation = isLive(lookup, "publicValuation") ? lookup.publicValuation : null;
  const salesLive = isLive(lookup, "sales");

  const lat = addressLive ? lookup.resolved.lat : null;
  const lon = addressLive ? lookup.resolved.lon : null;

  return {
    address: addressLive ? (lookup.resolved.formattedAddress ?? lookup.address) : lookup.address,
    postalCode: addressLive ? lookup.resolved.postalCode : null,
    lat,
    lon,
    bbrData: hasAnyValue(bbr) ? bbr : null,
    publicValuation: hasAnyValue(valuation) ? valuation : null,
    zone: addressLive ? lookup.resolved.zone : null,
    matrikelnr: addressLive ? lookup.resolved.matrikelnr : null,
    ejerlav: addressLive ? lookup.resolved.ejerlav : null,
    bfeNummer: addressLive ? lookup.resolved.bfeNummer : null,
    priceHistory: salesLive ? lookup.priceHistory : [],
    nearbySales: salesLive ? lookup.nearbySales : [],
    spar: lookup.spar,
    sources: summarizeLookupSources(lookup),
    mapUrl: openStreetMapUrl(lat, lon),
  };
}

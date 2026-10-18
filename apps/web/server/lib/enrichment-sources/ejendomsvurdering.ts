import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";
import { lookupHouseValuation, lookupValuationYears, type ValuationYear } from "./vur-valuations.js";

const MOCK_FLAG = "EJENDOMSVURDERING_MOCK_MODE";

/**
 * The public property valuation (offentlig ejendomsvurdering) in the shape the
 * listing enrichment and the lookup endpoint store: the latest valuation year,
 * and the one before it for the due-diligence comparison.
 *
 * The register is VUR, `VUR/v2` on Datafordeler's GraphQL service (see
 * `VUR_SERVICE` in vur-valuations.ts, which also holds the entity chain and
 * the rules for choosing a year's value). This file used to find VUR's field
 * names by introspection and key by matrikelnr/ejerlav. Datafordeler has since
 * switched introspection off (HC0046) and the address register no longer
 * returns a parcel, so that path could not answer. The names are now fixed
 * from the published schema and the key is the BFE number, found from the
 * husnummer when the caller has no BFE.
 *
 * When a value can't be located this reports a failed source and the caller
 * stores null. It never falls back to the mock generator outside mock mode,
 * because a plausible-looking fabricated assessed value is worse than none.
 */
export interface EjendomsvurderingData {
  /** Assessed total property value (DKK). */
  assessedPropertyValueDkk: number | null;
  /** Assessed land-only value (DKK). */
  assessedLandValueDkk: number | null;
  /** Assessment year of the latest valuation. */
  valuationYear: number | null;
  /** The valuation year before the latest one, for the change since. Null when the register has only one. */
  previousYear: number | null;
  previousPropertyValueDkk: number | null;
}

/** The latest year with a property value, and the year before it. Null when no year has one. */
export function valuationFromYears(years: readonly ValuationYear[]): EjendomsvurderingData | null {
  const withValue = years.filter((entry) => entry.propertyValueDkk !== null).sort((a, b) => a.year - b.year);
  const latest = withValue.at(-1);
  if (!latest) return null;
  const previous = withValue.at(-2) ?? null;
  return {
    assessedPropertyValueDkk: latest.propertyValueDkk,
    assessedLandValueDkk: latest.landValueDkk,
    valuationYear: latest.year,
    previousYear: previous?.year ?? null,
    previousPropertyValueDkk: previous?.propertyValueDkk ?? null,
  };
}

function mockValuation(seedInput: string): EjendomsvurderingData {
  const seed = hashSeed(seedInput);
  const landValue = 200_000 + (seed % 3_000_000);
  return {
    assessedPropertyValueDkk: landValue + 500_000 + (seed % 4_000_000),
    assessedLandValueDkk: landValue,
    valuationYear: 2024 + (seed % 2),
    previousYear: null,
    previousPropertyValueDkk: null,
  };
}

export interface ValuationLookupKey {
  /** DAR husnummer UUID. A house's valuation is found from it, through its BFE, when there is no BFE. */
  husnummerId?: string | null;
  /** BFE number: resolved by the address register, or stored by an earlier crawl. */
  bfeNummer?: string | null;
  matrikelnr?: string | null;
  ejerlav?: string | null;
}

/**
 * Looks up the public valuation for a property: from a known BFE when the
 * caller has one, else from its husnummer (houses only, see
 * `lookupHouseValuation`). A matrikelnr/ejerlav pair alone cannot be keyed
 * into VUR and is a failed source with that reason.
 */
export async function lookupEjendomsvurdering(key: ValuationLookupKey): Promise<SourceResult<EjendomsvurderingData>> {
  const husnummerId = key.husnummerId ?? null;
  const bfeNummer = key.bfeNummer ?? null;
  if (husnummerId === null && bfeNummer === null) {
    return sourceFailed(key.matrikelnr && key.ejerlav ? "VUR is keyed by BFE number, and this property has neither a BFE nor a husnummer to find one from" : "no husnummer or BFE number to look up");
  }

  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockValuation(bfeNummer ?? husnummerId!));

  // A BFE the caller already holds is used as it is, as before. Without one, a house's BFE is found from the husnummer.
  const years = bfeNummer !== null ? await lookupValuationYears(bfeNummer) : (await lookupHouseValuation(husnummerId)).valuation;
  if (!years.ok) return years;
  const valuation = valuationFromYears(years.data);
  return valuation ? sourceOk(valuation) : sourceFailed("no valuation year with a property value");
}

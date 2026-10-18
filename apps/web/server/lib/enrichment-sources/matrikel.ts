import type { LandRegistration, LandRestriction } from "../../../../../packages/shared/src/types/index.js";
import { asNonEmptyString } from "../crawl/map-utils.js";
import { postGraphQl, type DatafordelerService } from "./datafordeler.js";
import { hashSeed, mockModeEnabled, sourceFailed, sourceOk, type SourceResult } from "./types.js";
import { classifyHusnummer, lookupHouseBfe } from "./vur-valuations.js";

/**
 * Matriklen (MAT) via Datafordeler's entity-based GraphQL service, the same
 * `graphql.datafordeler.dk/<register>/<version>` shape and `apiKey` query
 * parameter as BBR and VUR, so DATAFORDELER_API_KEY works for all three.
 *
 * The register segment is `MAT` and the current version is v3 (Datafordeler's
 * "GraphQL (MAT)" page). The earlier version of this file queried
 * `Matrikel/<v>` with `Matrikel_Jordstykke` and `ejerlavsnavn`, none of which
 * exist, so it could never have returned a parcel.
 *
 * Every name below was checked against the published schema
 * (https://datafordeler.dk/GraphQLSchema/MAT.graphql, 2026-10-18):
 *
 *   BFE --MAT_SamletFastEjendom.BFEnummer--> id_lokalId
 *   id_lokalId --MAT_Jordstykke.samletFastEjendomLokalId--> parcels
 *
 * `BFEnummer` is a Long (a bare number in the filter), the reference
 * `samletFastEjendomLokalId` a String, and MAT queries take
 * `registreringstid`/`virkningstid` like BBR does. Status is spelled
 * "Gældende" in MAT, unlike BBR's numeric livscyklus codes.
 *
 * Keyed by BFE rather than matrikelnr/ejerlav: the address register no longer
 * returns a parcel, and a BFE is what `lookupHouseBfe` resolves from the
 * husnummer. The matrikelnr + ejerlav pair is only the fallback for a stored
 * identifier. `Jordstykke.ejerlavLokalId` is assumed to equal the numeric
 * ejerlavskode; a wrong guess finds no parcel and reports so, never a wrong one.
 */
export const MAT_SERVICE: DatafordelerService = {
  register: "MAT",
  versionEnv: "DATAFORDELER_MAT_VERSION",
  baseEnv: "DATAFORDELER_MAT_API_BASE",
  versions: ["v3", "v2"],
};

const MOCK_FLAG = "MATRIKEL_MOCK_MODE";
const CURRENT = "Gældende";
const BFE_PATTERN = /^\d{1,10}$/;
/** Parcels to read. A full page is refused: a truncated list proves nothing about area or restrictions. */
const PARCEL_PAGE = 100;

export interface MatrikelKey {
  bfeNummer: string | null;
  matrikelnr: string | null;
  ejerlavskode: string | null;
}

export type MatrikelData = LandRegistration;

const PARCEL_FIELDS = [
  "id_lokalId",
  "registreretAreal",
  "fredskov_areal",
  "strandbeskyttelse_areal",
  "klitfredning_areal",
  "majoratsskov_nummer",
  "faelleslod",
].join("\n        ");

const ESTATE_FIELDS = ["id_lokalId", "BFEnummer", "landbrugsnotering", "erFaelleslod", "hovedejendomOpdeltIEjerlejligh"].join("\n        ");

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNodes(value: unknown): Record<string, unknown>[] {
  const nodes = asRecord(value)?.nodes;
  return Array.isArray(nodes) ? nodes.flatMap((node) => (asRecord(node) ? [asRecord(node)!] : [])) : [];
}

function nonNegativeInt(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function temporal(): string {
  const now = JSON.stringify(new Date().toISOString());
  return `registreringstid: ${now} virkningstid: ${now}`;
}

export function buildEstateQuery(bfe: string): string {
  return `query Samlet {
  MAT_SamletFastEjendom(first: 2 ${temporal()} where: { BFEnummer: { eq: ${Number(bfe)} }, status: { eq: ${JSON.stringify(CURRENT)} } }) {
    nodes {
      ${ESTATE_FIELDS}
    }
  }
}`;
}

export function buildParcelsQuery(where: string): string {
  return `query Jordstykker {
  MAT_Jordstykke(first: ${PARCEL_PAGE} ${temporal()} where: { ${where}, status: { eq: ${JSON.stringify(CURRENT)} } }) {
    pageInfo { hasNextPage }
    nodes {
      ${PARCEL_FIELDS}
    }
  }
}`;
}

/**
 * Sums a restriction over the parcels that state one. A parcel carries a
 * restriction when its `*_areal` is above zero. The `*_omfang` text is not
 * read: its vocabulary is not in the schema, and a guessed "none" value would
 * print a warning on a parcel that has no restriction.
 */
function restriction(parcels: Record<string, unknown>[], field: string): LandRestriction | null {
  const areas = parcels.map((parcel) => nonNegativeInt(parcel[field])).filter((area): area is number => area !== null && area > 0);
  return areas.length > 0 ? { areaSqm: areas.reduce((sum, area) => sum + area, 0) } : null;
}

export function mapLandRegistration(
  parcels: Record<string, unknown>[],
  complete: boolean,
  estate: Record<string, unknown> | null,
): LandRegistration {
  const areas = parcels.map((parcel) => nonNegativeInt(parcel.registreretAreal));
  return {
    totalAreaSqm: complete && parcels.length > 0 && areas.every((area) => area !== null) ? areas.reduce<number>((sum, area) => sum + area!, 0) : null,
    parcelCount: parcels.length,
    forestReserve: restriction(parcels, "fredskov_areal"),
    beachProtection: restriction(parcels, "strandbeskyttelse_areal"),
    duneProtection: restriction(parcels, "klitfredning_areal"),
    entailedForest: parcels.some((parcel) => nonNegativeInt(parcel.majoratsskov_nummer) !== null),
    agriculturalNote: asNonEmptyString(estate?.landbrugsnotering),
    commonLot: typeof estate?.erFaelleslod === "boolean" ? estate.erFaelleslod : parcels.some((parcel) => parcel.faelleslod === true) || null,
    condominiumParent: typeof estate?.hovedejendomOpdeltIEjerlejligh === "boolean" ? estate.hovedejendomOpdeltIEjerlejligh : null,
  };
}

function mockLandRegistration(seedInput: string): LandRegistration {
  const seed = hashSeed(seedInput);
  return {
    totalAreaSqm: 400 + (seed % 2000),
    parcelCount: 1,
    forestReserve: null,
    beachProtection: null,
    duneProtection: null,
    entailedForest: false,
    agriculturalNote: null,
    commonLot: false,
    condominiumParent: false,
  };
}

async function parcelsOf(apiKey: string, where: string): Promise<SourceResult<{ nodes: Record<string, unknown>[]; complete: boolean }>> {
  const data = await postGraphQl<Record<string, unknown>>(MAT_SERVICE, apiKey, buildParcelsQuery(where));
  const connection = asRecord(data?.MAT_Jordstykke);
  if (!connection) return sourceFailed("MAT response has no parcel connection");
  const nodes = asNodes(connection);
  const hasNextPage = asRecord(connection.pageInfo)?.hasNextPage;
  if (hasNextPage !== false) return sourceFailed(`MAT lists more than ${PARCEL_PAGE} parcels (or did not say); refusing to keep a truncated list`);
  return sourceOk({ nodes, complete: true });
}

/**
 * Registered land and what is registered on it, for one property: total area,
 * the protections that restrict use (fredskov, strandbeskyttelse,
 * klitfredning), entailed forest, farmland note and the common-lot and
 * condominium markers.
 *
 * Resolves through the BFE when there is one. Without a BFE, a matrikelnr and
 * ejerlavskode find the parcel directly, and then only its own parcel, not the
 * estate's other parcels: the result is the same shape with `parcelCount` 1.
 */
export async function lookupMatrikel(key: MatrikelKey): Promise<SourceResult<MatrikelData>> {
  const bfe = key.bfeNummer && BFE_PATTERN.test(key.bfeNummer) ? key.bfeNummer : null;
  const byParcel = key.matrikelnr && key.ejerlavskode ? { matrikelnr: key.matrikelnr, ejerlavskode: key.ejerlavskode } : null;
  if (!bfe && !byParcel) return sourceFailed("no BFE number or matrikelnr/ejerlavskode to look up");

  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockLandRegistration(bfe ?? `${byParcel!.matrikelnr}|${byParcel!.ejerlavskode}`));

  const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) return sourceFailed("DATAFORDELER_API_KEY not configured");

  try {
    if (bfe) {
      const data = await postGraphQl<Record<string, unknown>>(MAT_SERVICE, apiKey, buildEstateQuery(bfe));
      const estates = asNodes(data?.MAT_SamletFastEjendom);
      if (estates.length === 0) return sourceFailed(`no current samlet fast ejendom for BFE ${bfe} (an apartment or a building on leased land has no land of its own)`);
      if (estates.length > 1) return sourceFailed(`several current estates for BFE ${bfe}`);
      const estate = estates[0]!;
      const estateId = asNonEmptyString(estate.id_lokalId);
      if (!estateId) return sourceFailed("MAT estate has no id_lokalId");
      const parcels = await parcelsOf(apiKey, `samletFastEjendomLokalId: { eq: ${JSON.stringify(estateId)} }`);
      if (!parcels.ok) return parcels;
      if (parcels.data.nodes.length === 0) return sourceFailed(`no current parcel on the estate of BFE ${bfe}`);
      return sourceOk(mapLandRegistration(parcels.data.nodes, parcels.data.complete, estate));
    }

    const parcels = await parcelsOf(
      apiKey,
      `matrikelnummer: { eq: ${JSON.stringify(byParcel!.matrikelnr)} }, ejerlavLokalId: { eq: ${JSON.stringify(byParcel!.ejerlavskode)} }`,
    );
    if (!parcels.ok) return parcels;
    if (parcels.data.nodes.length !== 1) {
      return sourceFailed(parcels.data.nodes.length === 0 ? "no current parcel for this matrikelnr/ejerlav" : "several parcels for this matrikelnr/ejerlav");
    }
    return sourceOk(mapLandRegistration(parcels.data.nodes, true, null));
  } catch (err) {
    return sourceFailed(err);
  }
}

export interface LandLookupKey extends MatrikelKey {
  /** DAR husnummer UUID. A house's BFE is found from it when the caller has none. */
  husnummerId?: string | null;
}

/**
 * `lookupMatrikel` for a property the caller knows by address. A BFE or
 * parcel identifier the caller holds is used as it is. Otherwise this finds
 * the BFE from the husnummer through BBR (shared and cached with the valuation
 * lookup, which needs the same number), and only for a house: an apartment's
 * land is the building's, so the parcel's restrictions would be read as its own.
 */
export async function lookupLand(key: LandLookupKey): Promise<SourceResult<MatrikelData>> {
  const husnummerId = key.husnummerId ?? null;
  if (husnummerId === null || (key.bfeNummer && BFE_PATTERN.test(key.bfeNummer))) return lookupMatrikel(key);
  if (mockModeEnabled(MOCK_FLAG)) return sourceOk(mockLandRegistration(husnummerId));

  const kind = await classifyHusnummer(husnummerId);
  if (!kind.ok) return sourceFailed(`building use: ${kind.error}`);
  if (kind.data === "other") return sourceFailed("not a house (apartment building or other use): the parcel's land is not the property's own");

  const bfe = await lookupHouseBfe(husnummerId);
  if (!bfe.ok) return sourceFailed(`bfe: ${bfe.error}`);
  return lookupMatrikel({ ...key, bfeNummer: bfe.data });
}

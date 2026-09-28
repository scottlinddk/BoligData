import type { Property } from "../../../../../packages/shared/src/types/index.js";
import type { CadastralOwner, CadastralParcel, CadastralReport } from "../../../../../packages/shared/src/types/cadastral.js";
import { fetchJson, HttpError } from "../crawl/http.js";
import { parseCadastralGeometry } from "./geometry.js";

const API = "https://api.matriklen.dk/api/v3.3";
const GRAPHQL = "https://graphql.datafordeler.dk";
const TIMEOUT = 6_000;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const id = (value: unknown): string | null => /^(?:[1-9]\d{0,14})$/.test(String(value)) ? String(value) : null;
const nodes = (value: unknown): Record<string, unknown>[] => {
  const list = record(value).nodes;
  if (!Array.isArray(list) || list.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new Error("Invalid register response");
  return list as Record<string, unknown>[];
};
const complete = (value: unknown): boolean => record(record(value).pageInfo).hasNextPage === false;
const temporal = (now: string): string => `registreringstid: ${JSON.stringify(now)}, virkningstid: ${JSON.stringify(now)}`;

async function query(root: string, selection: string, key: string): Promise<unknown> {
  // Same MAT v2 / Flexible v2 services and field names as Matriklen.dk's public client.
  // Always use this deployment's key, never the public site's browser key.
  const service = selection.includes("husnummerErPlaceretPaaJordstykke") || selection.includes("jordstykkeLiggerIEjerlav") ? "Flexible/v2" : "MAT/v2";
  const result = record(await fetchJson<unknown>(`${GRAPHQL}/${service}?${new URLSearchParams({ apiKey: key })}`, {
    method: "POST", body: JSON.stringify({ query: `query { ${selection} }` }),
    headers: { "Content-Type": "application/json" }, timeoutMs: TIMEOUT, attempts: 1,
  }));
  if (result.errors || !record(result.data)[root]) throw new Error("Cadastral register unavailable");
  return record(result.data)[root];
}

/** Strict address match before resolving owners; no fuzzy first hit or coordinate-nearest match. */
async function accessAddress(property: Property): Promise<string | null> {
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(property.idLokalid ?? "")) return property.idLokalid;
  const streetHouse = property.address.split(",")[0]!.trim();
  const postcode = property.postalCode ?? /\b\d{4}\b/.exec(property.address)?.[0];
  if (!postcode || !/\s\d+[a-z]?$/i.test(streetHouse)) return null;
  const params = new URLSearchParams({ q: streetHouse, postnr: postcode, per_side: "2" });
  const raw = await fetchJson<unknown>(`https://api.dataforsyningen.dk/adgangsadresser?${params}`, { timeoutMs: TIMEOUT, attempts: 1 });
  if (!Array.isArray(raw)) return null;
  const normalize = (s: string) => s.normalize("NFC").toLocaleLowerCase("da-DK").replace(/\s+/g, " ").trim();
  const matches = raw.map(record).filter(item => normalize(`${record(item.vejstykke).navn ?? ""} ${item.husnr ?? ""}`) === normalize(streetHouse) && String(record(item.postnummer).nr) === postcode);
  const resolved = matches.length === 1 ? text(matches[0]!.id) : null;
  return resolved && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(resolved) ? resolved : null;
}

async function resolveBfe(property: Property, key: string, now: string): Promise<string | null> {
  if (id(property.bfeNummer)) return id(property.bfeNummer);
  const addressId = await accessAddress(property);
  if (!addressId) return null;
  const result = await query("DAR_Husnummer", `DAR_Husnummer(first: 2, ${temporal(now)}, where: {id_lokalId: {eq: ${JSON.stringify(addressId)}}}) {
    nodes { husnummerErPlaceretPaaJordstykke(first: 10, where: {status: {eq: "Gældende"}}) { nodes {
      jordstykkeSamlesISamletFastEjendom(first: 10, where: {status: {eq: "Gældende"}}) { nodes { BFEnummer } pageInfo { hasNextPage } }
    } pageInfo { hasNextPage } } }
  }`, key);
  const houses = nodes(result);
  if (houses.length !== 1) return null;
  const parcels = houses[0]!.husnummerErPlaceretPaaJordstykke;
  if (!complete(parcels)) return null;
  const bfes = new Set<string>();
  for (const parcel of nodes(parcels)) {
    const estates = parcel.jordstykkeSamlesISamletFastEjendom;
    if (!complete(estates)) return null;
    for (const estate of nodes(estates)) { const bfe = id(estate.BFEnummer); if (bfe) bfes.add(bfe); }
  }
  return bfes.size === 1 ? [...bfes][0]! : null;
}

export function mapParcel(raw: Record<string, unknown>): CadastralParcel {
  const district = record(raw.jordstykkeLiggerIEjerlav);
  const geometries = raw.lodfladeRepraesentationJordstykke;
  const parts = nodes(geometries).map(part => parseCadastralGeometry(part.geometri));
  if (!id(raw.id_lokalId)) throw new Error("Missing parcel identity");
  return {
    id: id(raw.id_lokalId)!, number: text(raw.matrikelnummer), district: text(district.ejerlavsnavn), districtCode: id(district.ejerlavskode),
    registeredAreaSqm: number(raw.registreretAreal), roadAreaSqm: number(raw.vejareal), forestAreaSqm: number(raw.fredskov_areal),
    coastalProtectionAreaSqm: number(raw.strandbeskyttelse_areal), duneProtectionAreaSqm: number(raw.klitfredning_areal),
    geometry: complete(geometries) && parts.length > 0 && parts.every(part => part !== null) ? { polygons: parts.flatMap(part => part!.polygons) } : null,
  };
}

function share(value: unknown): string | null {
  const r = record(value), numerator = number(r.tæller), denominator = number(r.nævner);
  return numerator !== null && denominator !== null && Number.isInteger(numerator) && Number.isInteger(denominator) && denominator > 0 && numerator <= denominator ? `${numerator}/${denominator}` : null;
}
function date(value: unknown): string | null {
  const v = text(value);
  return v && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) && Number.isFinite(Date.parse(v)) ? v.slice(0, 10) : null;
}
export function mapOwners(raw: unknown): CadastralOwner[] {
  const items = record(raw).ejere;
  if (!Array.isArray(items) || items.length > 100) throw new Error("Invalid ownership response");
  return items.map(item => {
    const owner = record(item);
    if (!Object.keys(owner).length) throw new Error("Invalid owner");
    const protectedName = owner.type === "BeskyttetPerson";
    // Whitelist fields. Never return CPR, home/contact addresses, or hidden/protected names.
    return { name: protectedName ? null : text(owner.navn), protected: protectedName, type: text(owner.type),
      companyNumber: !protectedName && /^\d{8}$/.test(String(owner.cvr)) ? String(owner.cvr) : null,
      actualShare: share(owner.faktiskEjerandel), registeredShare: share(owner.tinglystEjerandel),
      takeoverDate: date(owner.overtagelsesdato), registrationDate: date(owner.tinglysningsdato) };
  });
}

async function owners(bfe: string): Promise<CadastralReport["owners"]> {
  try {
    const raw = await fetchJson<unknown>(`${API}/BfeEjer?${new URLSearchParams({ bfe })}`, { timeoutMs: TIMEOUT, attempts: 1 });
    const items = mapOwners(raw);
    if (items.some(item => item.name === "Opdelt i ejerlejligheder")) return { status: "unavailable", items: [], reason: "condominium_parent" };
    return { status: items.length ? "available" : "not_found", items, reason: null };
  } catch (error) {
    return { status: error instanceof HttpError && (error.status === 401 || error.status === 403) ? "requires_access" : "unavailable", items: [], reason: "source_unavailable" };
  }
}

export async function getCadastralReport(property: Property): Promise<CadastralReport> {
  const now = new Date().toISOString();
  const report: CadastralReport = { status: "unavailable", scope: "land_property", bfeNumber: id(property.bfeNummer), mapUrl: null, checkedAt: now,
    totalAreaSqm: null, parcelsComplete: false, parcels: [], geometry: null, landUse: null, condominiumParent: null, commonLot: null, separateRoad: null,
    owners: { status: "unavailable", items: [], reason: "source_unavailable" } };
  // A generic BFE route handles both land-property and unit identifiers correctly.
  if (report.bfeNumber) report.mapUrl = `https://www.matriklen.dk/kort/bfe/${report.bfeNumber}`;
  if (property.dataMode === "mock" || property.dataMode === "demo") return { ...report, bfeNumber: null, mapUrl: null };
  const key = process.env.DATAFORDELER_API_KEY?.trim();
  if (!key) return report;
  try {
    const bfe = await resolveBfe(property, key, now);
    if (!bfe) { report.status = "not_found"; return report; }
    report.bfeNumber = bfe;
    report.mapUrl = `https://www.matriklen.dk/kort/bfe/${bfe}`;
    const estateData = await query("MAT_SamletFastEjendom", `MAT_SamletFastEjendom(first: 2, ${temporal(now)}, where: {BFEnummer: {eq: ${bfe}}, status: {eq: "Gældende"}}) {
      nodes { id_lokalId BFEnummer status geometri { wkt crs type } hovedejendomOpdeltIEjerlejligh landbrugsnotering erFaelleslod udskiltVej }
    }`, key);
    const estates = nodes(estateData);
    if (estates.length !== 1 || id(estates[0]!.BFEnummer) !== bfe || !id(estates[0]!.id_lokalId)) { report.status = "not_found"; return report; }
    const estate = estates[0]!;
    report.status = "available";
    report.mapUrl = `https://www.matriklen.dk/kort/sfe/${bfe}`;
    report.geometry = parseCadastralGeometry(estate.geometri);
    report.landUse = text(estate.landbrugsnotering);
    report.condominiumParent = bool(estate.hovedejendomOpdeltIEjerlejligh);
    report.commonLot = bool(estate.erFaelleslod);
    report.separateRoad = bool(estate.udskiltVej);
    const canShowOwners = report.condominiumParent === false && report.commonLot === false;
    const [parcelResult, ownerResult] = await Promise.allSettled([
      query("MAT_Jordstykke", `MAT_Jordstykke(first: 201, ${temporal(now)}, where: {samletFastEjendomLokalId: {eq: ${JSON.stringify(estate.id_lokalId)}}, status: {eq: "Gældende"}}) {
        nodes { id_lokalId matrikelnummer registreretAreal vejareal fredskov_areal strandbeskyttelse_areal klitfredning_areal
          jordstykkeLiggerIEjerlav { ejerlavskode ejerlavsnavn }
          lodfladeRepraesentationJordstykke(first: 100, where: {status: {eq: "Gældende"}}) { nodes { geometri { wkt crs type } } pageInfo { hasNextPage } }
        } pageInfo { hasNextPage }
      }`, key),
      canShowOwners ? owners(bfe) : Promise.resolve<CadastralReport["owners"]>({ status: "unavailable", items: [], reason: report.condominiumParent ? "condominium_parent" : report.commonLot ? "common_lot" : "source_unavailable" }),
    ]);
    if (ownerResult.status === "fulfilled") report.owners = ownerResult.value;
    if (parcelResult.status === "fulfilled") {
      try {
        const parcels = nodes(parcelResult.value).map(mapParcel);
        report.parcels = parcels;
        report.parcelsComplete = complete(parcelResult.value) && parcels.length > 0 && new Set(parcels.map(p => p.id)).size === parcels.length;
        // The site's "Samlet areal" is the sum of ALL direct parcels, excluding shared-lot interests.
        if (report.parcelsComplete && parcels.every(p => p.registeredAreaSqm !== null)) report.totalAreaSqm = parcels.reduce((total, p) => total + p.registeredAreaSqm!, 0);
      } catch { /* A malformed parcel must not remove the map or ownership result. */ }
    }
    return report;
  } catch { return report; }
}

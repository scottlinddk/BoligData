import type { CadastralOwner, CadastralStatus } from "./cadastral";

/** Parcels in a map viewport. Geometry is WGS84 lon/lat so the browser can draw it directly. */
export interface ParcelMapParcel {
  id: string;
  /** Land property (SFE) the parcel belongs to; owners are looked up per BFE. */
  bfeNumber: string | null;
  number: string | null;
  district: string | null;
  /** GeoJSON Polygon/MultiPolygon coordinates ([lon, lat]). */
  geometry: { type: "Polygon"; coordinates: [number, number][][] } | { type: "MultiPolygon"; coordinates: [number, number][][][] };
}

export interface ParcelMapResponse {
  status: "available" | "unavailable";
  /** `mock` is fixture data and never describes real property. */
  source: "datafordeler" | "mock";
  parcels: ParcelMapParcel[];
  /** True when the viewport held more parcels than were returned. */
  truncated: boolean;
}

/** One access address (husnummer) on the land property, e.g. `label: "Vejnavn 12A, 9000 By"`, `houseNumber: "12A"`. */
export interface ParcelAddress {
  label: string;
  houseNumber: string | null;
}

export interface ParcelOwnerResponse {
  bfeNumber: string;
  status: CadastralStatus;
  /** Protected persons are returned with `name: null, protected: true`. */
  owners: CadastralOwner[];
  /** Empty when the register has none or could not be read; never blocks the owner answer. */
  addresses: ParcelAddress[];
  reason: "source_unavailable" | "condominium_parent" | "common_lot" | null;
}

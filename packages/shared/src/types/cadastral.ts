export type CadastralStatus = "available" | "unavailable" | "not_found" | "requires_access";
export interface CadastralGeometry {
  /** Metres in ETRS89 / UTM zone 32N (EPSG:25832). Polygon rings include holes. */
  polygons: [number, number][][][];
}
export interface CadastralParcel {
  id: string;
  number: string | null;
  district: string | null;
  districtCode: string | null;
  registeredAreaSqm: number | null;
  roadAreaSqm: number | null;
  forestAreaSqm: number | null;
  coastalProtectionAreaSqm: number | null;
  duneProtectionAreaSqm: number | null;
  geometry: CadastralGeometry | null;
}
export interface CadastralOwner {
  name: string | null;
  protected: boolean;
  type: string | null;
  companyNumber: string | null;
  actualShare: string | null;
  registeredShare: string | null;
  takeoverDate: string | null;
  registrationDate: string | null;
}
export interface CadastralReport {
  status: CadastralStatus;
  bfeNumber: string | null;
  /** A husnummer identifies the land property, never an individual condominium. */
  scope: "land_property";
  mapUrl: string | null;
  checkedAt: string;
  totalAreaSqm: number | null;
  parcelsComplete: boolean;
  parcels: CadastralParcel[];
  geometry: CadastralGeometry | null;
  landUse: string | null;
  condominiumParent: boolean | null;
  commonLot: boolean | null;
  separateRoad: boolean | null;
  owners: { status: CadastralStatus; items: CadastralOwner[]; reason: "source_unavailable" | "condominium_parent" | "common_lot" | null };
}

import type { ParcelOwnerResponse } from "@shared/types/parcel-map";

/** Short owner text for a map label: first owner, "+N" for co-owners. Empty when no owner is known. */
export function parcelOwnerLabel(data: ParcelOwnerResponse | undefined, da: boolean): string {
  if (!data || data.status !== "available") return "";
  const names = data.owners.map(o => (o.protected ? (da ? "Beskyttet" : "Protected") : o.name)).filter((n): n is string => !!n);
  if (!names.length) return "";
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]!;
}

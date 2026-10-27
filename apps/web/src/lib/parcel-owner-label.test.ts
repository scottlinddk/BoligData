import { describe, expect, it } from "vitest";
import type { ParcelOwnerResponse } from "@shared/types/parcel-map";
import { ownerStatusText, parcelOwnerLabel } from "./parcel-owner-label";

const response = (owners: Array<{ name: string | null; protected?: boolean; status?: "deceased" | "ceased" | null }>, status: ParcelOwnerResponse["status"] = "available"): ParcelOwnerResponse =>
  ({ bfeNumber: "1", status, reason: null, addresses: [], owners: owners.map(o => ({ protected: false, ...o })) } as unknown as ParcelOwnerResponse);

describe("parcelOwnerLabel", () => {
  it("is empty without a looked-up owner", () => {
    expect(parcelOwnerLabel(undefined, true)).toBe("");
    expect(parcelOwnerLabel(response([], "not_found"), true)).toBe("");
    expect(parcelOwnerLabel(response([{ name: "A" }], "unavailable"), true)).toBe("");
  });
  it("shows one owner, or the first plus a co-owner count", () => {
    expect(parcelOwnerLabel(response([{ name: "Karlo Rix Hollænder" }]), true)).toBe("Karlo Rix Hollænder");
    expect(parcelOwnerLabel(response([{ name: "A" }, { name: "B" }, { name: "C" }]), true)).toBe("A +2");
  });
  it("marks a deceased owner as Matriklen does", () => {
    expect(parcelOwnerLabel(response([{ name: "Karlo Rix", status: "deceased" }]), true)).toBe("Karlo Rix (person død)");
    expect(parcelOwnerLabel(response([{ name: "Karlo Rix", status: "deceased" }, { name: "B" }]), false)).toBe("Karlo Rix (person deceased) +1");
    expect(ownerStatusText("ceased", true)).toBe("ophørt");
  });
  it("never leaks a protected name", () => {
    expect(parcelOwnerLabel(response([{ name: null, protected: true }]), true)).toBe("Beskyttet");
    expect(parcelOwnerLabel(response([{ name: null, protected: true }]), false)).toBe("Protected");
  });
});

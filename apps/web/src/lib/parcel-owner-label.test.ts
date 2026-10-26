import { describe, expect, it } from "vitest";
import type { ParcelOwnerResponse } from "@shared/types/parcel-map";
import { parcelOwnerLabel } from "./parcel-owner-label";

const response = (owners: Array<{ name: string | null; protected?: boolean }>, status: ParcelOwnerResponse["status"] = "available"): ParcelOwnerResponse =>
  ({ bfeNumber: "1", status, reason: null, owners: owners.map(o => ({ protected: false, ...o })) } as unknown as ParcelOwnerResponse);

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
  it("never leaks a protected name", () => {
    expect(parcelOwnerLabel(response([{ name: null, protected: true }]), true)).toBe("Beskyttet");
    expect(parcelOwnerLabel(response([{ name: null, protected: true }]), false)).toBe("Protected");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getPropertyLookup } from "./api";

vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

function stubFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  })) as unknown as typeof fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPropertyLookup", () => {
  it("sends the listing's own figures as the lookup's screening inputs", async () => {
    const fetchSpy = stubFetch();

    await getPropertyLookup({
      address: "Floravej 6, 9000 Aalborg",
      askingPrice: 5_000_000,
      postalCode: "9000",
      lat: 57.04591973,
      lon: 9.87640126,
      roomCount: 5,
      energyLabel: "C",
    });

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url.startsWith("/api/property-lookup?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("address")).toBe("Floravej 6, 9000 Aalborg");
    expect(params.get("askingPrice")).toBe("5000000");
    expect(params.get("postalCode")).toBe("9000");
    expect(params.get("lat")).toBe("57.04591973");
    expect(params.get("energyLabel")).toBe("C");
  });

  it("omits unknown params rather than sending them as the strings 'null'/'undefined'", async () => {
    const fetchSpy = stubFetch();

    await getPropertyLookup({
      address: "Floravej 6",
      askingPrice: 5_000_000,
      postalCode: null,
      lat: null,
      lon: null,
      roomCount: null,
      energyLabel: null,
    });

    const params = new URLSearchParams(String(fetchSpy.mock.calls[0]?.[0]).split("?")[1]);
    expect(params.has("postalCode")).toBe(false);
    expect(params.has("lat")).toBe(false);
    expect(params.has("energyLabel")).toBe(false);
    expect(params.get("address")).toBe("Floravej 6");
  });

  it("still sends a zero coordinate, which is a value rather than a missing one", async () => {
    const fetchSpy = stubFetch();
    await getPropertyLookup({ address: "X", askingPrice: 1, lat: 0, lon: 0 });
    const params = new URLSearchParams(String(fetchSpy.mock.calls[0]?.[0]).split("?")[1]);
    expect(params.get("lat")).toBe("0");
  });
});

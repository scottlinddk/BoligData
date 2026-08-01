import { describe, expect, it } from "vitest";
import { mapBoligaRecord } from "./boliga";
import { mapBoligsidenCase } from "./boligsiden";
import { dedupeByExternalId, listingContentHash } from "./map-utils";
import type { RawListing } from "./types";

const boligaRecord = {
  id: 123456,
  price: 2500000,
  size: 95,
  street: "Testgade 12, 2. th",
  city: "Aalborg",
  zipCode: 9000,
  latitude: 57.05,
  longitude: 9.92,
  propertyType: 3,
  rooms: 3,
  buildYear: 1955,
  createdDate: "2026-07-01T08:00:00.000Z",
};

const boligsidenCase = {
  caseID: "abc-123",
  priceCash: 3200000,
  housingArea: 120,
  addressType: "villa",
  numberOfRooms: 5,
  coordinates: { lat: 56.15, lon: 10.21 },
  address: {
    roadName: "Prøvevej",
    houseNumber: "7",
    zipCode: 8000,
    municipality: { name: "Aarhus" },
    buildYear: 1972,
  },
  realtor: { name: "EDC Aarhus" },
  status: { createdDate: "2026-06-20T00:00:00Z" },
};

describe("mapBoligaRecord", () => {
  it("maps a valid record to a RawListing", () => {
    const listing = mapBoligaRecord(boligaRecord);
    expect(listing).toEqual({
      address: "Testgade 12, 2. th",
      municipality: "Aalborg",
      postal_code: "9000",
      price: 2500000,
      sqm: 95,
      listing_date: "2026-07-01",
      listing_source: "boliga",
      external_id: "123456",
      lat: 57.05,
      lon: 9.92,
      status: "active",
      building_year: 1955,
      property_type: "apartment",
      rooms: 3,
      images: [],
      description: null,
      agent_name: null,
      listing_url: "https://www.boliga.dk/bolig/123456",
      sold_price_history: [],
    });
  });

  it("skips records missing required fields", () => {
    expect(mapBoligaRecord({ ...boligaRecord, price: undefined })).toBeNull();
    expect(mapBoligaRecord({ ...boligaRecord, size: 0 })).toBeNull();
    expect(mapBoligaRecord({ ...boligaRecord, street: "" })).toBeNull();
    expect(mapBoligaRecord(null)).toBeNull();
    expect(mapBoligaRecord("not an object")).toBeNull();
  });

  it("skips records with coordinates outside Denmark", () => {
    expect(mapBoligaRecord({ ...boligaRecord, latitude: 48.8 })).toBeNull();
    expect(mapBoligaRecord({ ...boligaRecord, longitude: 25 })).toBeNull();
  });

  it("falls back to 'other' for unknown property type codes", () => {
    expect(mapBoligaRecord({ ...boligaRecord, propertyType: 99 })?.property_type).toBe("other");
    expect(mapBoligaRecord({ ...boligaRecord, propertyType: undefined })?.property_type).toBe("other");
  });
});

describe("mapBoligsidenCase", () => {
  it("maps a valid case to a RawListing", () => {
    const listing = mapBoligsidenCase(boligsidenCase);
    expect(listing).toEqual({
      address: "Prøvevej 7",
      municipality: "Aarhus",
      postal_code: "8000",
      price: 3200000,
      sqm: 120,
      listing_date: "2026-06-20",
      listing_source: "boligsiden",
      external_id: "abc-123",
      lat: 56.15,
      lon: 10.21,
      status: "active",
      building_year: 1972,
      property_type: "villa",
      rooms: 5,
      images: [],
      description: null,
      agent_name: "EDC Aarhus",
      listing_url: null,
      sold_price_history: [],
    });
  });

  it("skips cases missing required fields", () => {
    expect(mapBoligsidenCase({ ...boligsidenCase, caseID: undefined })).toBeNull();
    expect(mapBoligsidenCase({ ...boligsidenCase, priceCash: -1 })).toBeNull();
    expect(mapBoligsidenCase({ ...boligsidenCase, coordinates: undefined })).toBeNull();
    expect(mapBoligsidenCase(null)).toBeNull();
  });

  it("normalizes unknown address types to 'other'", () => {
    expect(mapBoligsidenCase({ ...boligsidenCase, addressType: "castle" })?.property_type).toBe("other");
  });

  it("maps the address's registered sales, newest first", () => {
    // Registration shape captured from a live response (2026-08-01).
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      address: {
        ...boligsidenCase.address,
        registrations: [
          { amount: 1_495_000, area: 201, date: "2004-08-23", registrationID: "2736865", type: "normal" },
          {
            amount: 2_050_000,
            area: 190,
            date: "2021-08-30",
            livingArea: 201,
            perAreaPrice: 10199,
            registrationID: "5654008",
            type: "normal",
          },
        ],
      },
    });

    expect(listing?.sold_price_history).toEqual([
      { soldDate: "2021-08-30", price: 2_050_000, pricePerSqm: 10199, saleType: "normal" },
      // No perAreaPrice on the older row — derived from amount/area instead.
      { soldDate: "2004-08-23", price: 1_495_000, pricePerSqm: Math.round(1_495_000 / 201), saleType: "normal" },
    ]);
  });

  it("carries the registration type through so a family sale isn't read as a market price", () => {
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      address: {
        ...boligsidenCase.address,
        registrations: [{ amount: 900_000, livingArea: 120, date: "2020-01-01", type: "family" }],
      },
    });
    expect(listing?.sold_price_history[0]?.saleType).toBe("family");
  });

  it("skips registrations with no date, price or usable area rather than emitting NaN", () => {
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      address: {
        ...boligsidenCase.address,
        registrations: [
          { amount: 1_000_000, type: "normal" },
          { date: "2020-01-01", type: "normal" },
          { amount: 1_000_000, date: "2020-01-01", type: "normal" },
          "not an object",
        ],
      },
    });
    expect(listing?.sold_price_history).toEqual([]);
  });

  it("treats a missing registrations array as no history, not as a failure", () => {
    expect(mapBoligsidenCase(boligsidenCase)?.sold_price_history).toEqual([]);
  });

  it("parses images with categories and sized variants", () => {
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      images: [
        {
          url: "https://cdn.example/photo-1440x960.jpg",
          category: "image",
          imageSources: [
            { url: "https://cdn.example/photo-300x200.jpg", width: 300, height: 200 },
            { url: "https://cdn.example/photo-1440x960.jpg", width: 1440, height: 960 },
          ],
        },
        {
          url: "https://cdn.example/floorplan.jpg",
          category: "floorplan",
          imageSources: [{ url: "https://cdn.example/floorplan.jpg", width: 1440, height: 960 }],
        },
      ],
    });

    expect(listing?.images).toEqual([
      {
        url: "https://cdn.example/photo-1440x960.jpg",
        category: "photo",
        sources: [
          { url: "https://cdn.example/photo-300x200.jpg", width: 300, height: 200 },
          { url: "https://cdn.example/photo-1440x960.jpg", width: 1440, height: 960 },
        ],
      },
      {
        url: "https://cdn.example/floorplan.jpg",
        category: "floorplan",
        sources: [{ url: "https://cdn.example/floorplan.jpg", width: 1440, height: 960 }],
      },
    ]);
  });

  it("drops images missing a usable url", () => {
    const listing = mapBoligsidenCase({ ...boligsidenCase, images: [{ category: "image", imageSources: [] }] });
    expect(listing?.images).toEqual([]);
  });

  it("keeps an image whose imageSources lack width/height metadata", () => {
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      images: [{ category: "image", imageSources: [{ url: "https://cdn.example/photo-unsized.jpg" }] }],
    });
    expect(listing?.images).toEqual([
      { url: "https://cdn.example/photo-unsized.jpg", category: "photo", sources: [] },
    ]);
  });
});

describe("listing_url mapping", () => {
  it("prefers a URL the Boliga record states outright", () => {
    const listing = mapBoligaRecord({ ...boligaRecord, url: "https://www.boliga.dk/bolig/999/testgade-12" });
    expect(listing!.listing_url).toBe("https://www.boliga.dk/bolig/999/testgade-12");
  });

  it("resolves a relative Boliga path against boliga.dk", () => {
    const listing = mapBoligaRecord({ ...boligaRecord, detailUrl: "/bolig/123456/testgade-12" });
    expect(listing!.listing_url).toBe("https://www.boliga.dk/bolig/123456/testgade-12");
  });

  it("falls back to the id-based Boliga route when the record carries no link", () => {
    expect(mapBoligaRecord(boligaRecord)!.listing_url).toBe("https://www.boliga.dk/bolig/123456");
  });

  it("builds a Boligsiden link from the case slug", () => {
    const listing = mapBoligsidenCase({ ...boligsidenCase, slug: "villa/proevevej-7-8000-aarhus" });
    expect(listing!.listing_url).toBe("https://www.boligsiden.dk/villa/proevevej-7-8000-aarhus");
  });

  it("falls back to the address slug when the case has none", () => {
    const listing = mapBoligsidenCase({
      ...boligsidenCase,
      address: { ...boligsidenCase.address, slug: "/adresse/proevevej-7-8000-aarhus" },
    });
    expect(listing!.listing_url).toBe("https://www.boligsiden.dk/adresse/proevevej-7-8000-aarhus");
  });

  it("leaves the Boligsiden link null rather than guessing a route from the case id", () => {
    expect(mapBoligsidenCase(boligsidenCase)!.listing_url).toBeNull();
  });

  // The value lands in an href, so a non-http scheme from an undocumented
  // upstream API must never survive mapping.
  it("rejects a javascript: URL instead of storing it", () => {
    // eslint-disable-next-line no-script-url
    const listing = mapBoligaRecord({ ...boligaRecord, url: "javascript:alert(1)" });
    expect(listing!.listing_url).toBe("https://www.boliga.dk/bolig/123456");
  });

  it("rejects a slug that resolves off the source's origin", () => {
    const listing = mapBoligsidenCase({ ...boligsidenCase, slug: "//evil.example/pwned" });
    expect(listing!.listing_url).toBeNull();
  });
});

describe("listingContentHash", () => {
  const listing = mapBoligaRecord(boligaRecord)!;

  it("is stable for identical content", () => {
    expect(listingContentHash(listing)).toBe(listingContentHash({ ...listing }));
  });

  it("changes when listing content changes", () => {
    expect(listingContentHash(listing)).not.toBe(listingContentHash({ ...listing, price: 1 }));
  });
});

describe("dedupeByExternalId", () => {
  it("keeps the last occurrence per external_id", () => {
    const a = mapBoligaRecord(boligaRecord)!;
    const b: RawListing = { ...a, price: 999 };
    const result = dedupeByExternalId([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]!.price).toBe(999);
  });
});

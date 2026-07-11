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

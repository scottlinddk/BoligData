export interface RawListing {
  address: string;
  municipality: string;
  postal_code: string | null;
  price: number;
  sqm: number;
  listing_date: string;
  listing_source: "boligsiden" | "boliga";
  external_id: string;
  lat: number;
  lon: number;
  status: "active" | "sold" | "withdrawn";
  building_year: number | null;
  property_type: string;
  rooms: number | null;
  image_urls: string[];
  description: string | null;
  agent_name: string | null;
}

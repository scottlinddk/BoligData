import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { sendError } from "./http-helpers.js";
import { lookupSchoolDistrict } from "./school-district.js";

/** Authenticated stored-listing lookup; never accepts caller-supplied source URLs. */
export async function handleSchoolDistrict(client: SupabaseClient, res: VercelResponse, id: string): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const { data: property, error } = await client.from("properties")
    .select("address,postal_code,id_lokalid,data_mode").eq("id", id).single();
  if (error || !property) {
    sendError(res, 404, "Property not found");
    return;
  }
  res.status(200).json(await lookupSchoolDistrict({ address: property.address, postalCode: property.postal_code,
    idLokalid: property.id_lokalid, dataMode: property.data_mode }));
}

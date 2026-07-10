import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../server/middleware/cors.js";
import { getServiceRoleClient } from "../server/lib/supabase.js";
import { fetchBoligsidenListings } from "../server/lib/crawl/boligsiden.js";
import { fetchBoligaListings } from "../server/lib/crawl/boliga.js";
import { enrichProperty } from "../server/lib/crawl/enrich.js";

/**
 * Daily ingest entry point, triggered by .github/workflows/crawl.yml.
 * Requires SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET to be set in the
 * Vercel project's environment variables (manual step — no MCP tool sets
 * these). With CRAWL_MOCK_MODE=true (the default), it upserts the fixture
 * listings under lib/crawl/fixtures/ instead of scraping live sites.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expected = process.env.CRON_SECRET;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [boligsidenListings, boligaListings] = await Promise.all([
      fetchBoligsidenListings(),
      fetchBoligaListings(),
    ]);
    const listings = [...boligsidenListings, ...boligaListings];

    const client = getServiceRoleClient();
    let upserted = 0;

    for (const listing of listings) {
      const { data: property, error } = await client
        .from("properties")
        .upsert(listing, { onConflict: "listing_source,external_id" })
        .select("id")
        .single();

      if (error || !property) continue;
      upserted += 1;

      const enrichment = await enrichProperty(listing);
      await client
        .from("enrichments")
        .upsert({ property_id: property.id, ...enrichment }, { onConflict: "property_id" });
    }

    res.status(200).json({ upserted, total: listings.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Crawl failed" });
  }
}

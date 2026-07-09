import type { VercelRequest, VercelResponse } from "@vercel/node";
import type {
  SearchPropertiesQuery,
  SortDirection,
  SortField,
} from "../../../packages/shared/src/types/api";
import { applyCors } from "./middleware/cors";
import { getAnonClient } from "./lib/supabase";
import { searchProperties } from "./lib/search";

function str(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

function num(v: unknown): number | undefined {
  const s = str(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseQuery(req: VercelRequest): SearchPropertiesQuery {
  const q = req.query;
  return {
    location: str(q.location),
    minPrice: num(q.minPrice),
    maxPrice: num(q.maxPrice),
    minSqm: num(q.minSqm),
    maxSqm: num(q.maxSqm),
    maxDaysOnMarket: num(q.maxDaysOnMarket),
    minBuildingYear: num(q.minBuildingYear),
    maxBuildingYear: num(q.maxBuildingYear),
    sortField: str(q.sortField) as SortField | undefined,
    sortDirection: str(q.sortDirection) as SortDirection | undefined,
    limit: num(q.limit),
    offset: num(q.offset),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const client = getAnonClient();
    const result = await searchProperties(client, parseQuery(req));
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
}

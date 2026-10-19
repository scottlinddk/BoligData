import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/constants";

const LAST_SEARCH_KEY = "boligdata.search.last";
const VIEW_PREFS_KEY = "boligdata.search.view";

export interface SearchViewPrefs {
  pageSize: number;
  desktopMap: boolean;
  mobileTab: "list" | "map";
}

export const DEFAULT_VIEW_PREFS: SearchViewPrefs = { pageSize: DEFAULT_PAGE_SIZE, desktopMap: false, mobileTab: "list" };

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}
function write(storage: () => Storage, key: string, value: string) {
  try { storage().setItem(key, value); } catch { /* Storage can be blocked; the URL stays the source of truth. */ }
}

/** Query string (without "?") of the most recent search in this tab, so other pages can link back to it. */
export function readLastSearch(): string {
  const raw = read(() => window.sessionStorage, LAST_SEARCH_KEY) ?? "";
  return raw.startsWith("?") ? raw.slice(1) : raw;
}

export function writeLastSearch(query: string) {
  write(() => window.sessionStorage, LAST_SEARCH_KEY, query);
}

export function lastSearchPath(): string {
  const query = readLastSearch();
  return query ? `/?${query}` : "/";
}

export function parseViewPrefs(raw: string | null): SearchViewPrefs {
  if (!raw) return DEFAULT_VIEW_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<SearchViewPrefs>;
    return {
      pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(value.pageSize as number) ? value.pageSize as number : DEFAULT_VIEW_PREFS.pageSize,
      desktopMap: typeof value.desktopMap === "boolean" ? value.desktopMap : DEFAULT_VIEW_PREFS.desktopMap,
      mobileTab: value.mobileTab === "map" ? "map" : "list",
    };
  } catch { return DEFAULT_VIEW_PREFS; }
}

/** View choices are per-device preferences, not part of a shareable search URL. */
export function readViewPrefs(): SearchViewPrefs {
  return parseViewPrefs(read(() => window.localStorage, VIEW_PREFS_KEY));
}

export function writeViewPrefs(prefs: SearchViewPrefs) {
  write(() => window.localStorage, VIEW_PREFS_KEY, JSON.stringify(prefs));
}

/** 1-based `page` query param to a zero-based offset. */
export function pageToOffset(raw: string | null, pageSize: number): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 1 ? (page - 1) * pageSize : 0;
}

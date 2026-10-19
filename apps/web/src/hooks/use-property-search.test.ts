import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { SearchPropertiesResponse } from "@shared/types/api";
import { searchProperties } from "@/lib/api";
import { parseFilters } from "@/lib/url-filters";
import { propertySearchOptions } from "./use-property-search";

vi.mock("@/lib/api", () => ({ searchProperties: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: vi.fn() }));

const filters = parseFilters(new URLSearchParams("location=Aalborg"));
const firstPage: SearchPropertiesResponse = {
  authenticated: true, properties: [], summaries: [], total: 120,
  offset: 0, limit: 50, page: 1, totalPages: 3,
};
let client: QueryClient;
const cleanups: (() => void)[] = [];

function observeFirstPage() {
  const options = propertySearchOptions(filters, 0, 50, "account-a");
  client.setQueryData(options.queryKey, firstPage);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  cleanups.push(() => { unsubscribe(); observer.destroy(); });
  return observer;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  vi.mocked(searchProperties).mockReset();
  vi.mocked(searchProperties).mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  client.clear();
});

describe("property search loading transitions", () => {
  it("keeps the previous page and its range until the next page arrives", async () => {
    let resolvePage!: (page: SearchPropertiesResponse) => void;
    vi.mocked(searchProperties).mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const observer = observeFirstPage();
    observer.setOptions(propertySearchOptions(filters, 50, 50, "account-a"));

    expect(observer.getCurrentResult()).toMatchObject({ isFetching: true, isPlaceholderData: true, data: { offset: 0, limit: 50 } });
    expect(searchProperties).toHaveBeenCalledWith({ ...filters, offset: 50, limit: 50 });
    resolvePage({ ...firstPage, offset: 50, page: 2 });

    await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({ isFetching: false, isPlaceholderData: false, data: { offset: 50, page: 2 } }));
  });

  it("keeps the current results while changing page size", () => {
    const observer = observeFirstPage();
    observer.setOptions(propertySearchOptions(filters, 0, 25, "account-a"));
    expect(observer.getCurrentResult()).toMatchObject({ isFetching: true, isPlaceholderData: true, data: { limit: 50 } });
  });

  it.each([
    { ...filters, location: "Aarhus" },
    { ...filters, polygon: JSON.stringify([[9, 57], [10, 57], [10, 58], [9, 58]]) },
    { ...filters, sortDirection: "asc" as const },
  ])("never presents old results as matching changed filters", nextFilters => {
    const observer = observeFirstPage();
    observer.setOptions(propertySearchOptions(nextFilters, 0, 50, "account-a"));
    expect(observer.getCurrentResult()).toMatchObject({ isPending: true, isPlaceholderData: false, data: undefined });
  });

  it.each([null, "account-b"])("does not retain data when the account changes to %s", nextUser => {
    const observer = observeFirstPage();
    observer.setOptions(propertySearchOptions(filters, 0, 50, nextUser));
    expect(observer.getCurrentResult()).toMatchObject({ isPending: true, isPlaceholderData: false, data: undefined });
  });

  it("discards the previous page if the requested page fails", async () => {
    vi.mocked(searchProperties).mockRejectedValueOnce(new Error("Network unavailable"));
    const observer = observeFirstPage();
    observer.setOptions(propertySearchOptions(filters, 50, 50, "account-a"));
    await vi.waitFor(() => expect(observer.getCurrentResult()).toMatchObject({ isError: true, isFetching: false, isPlaceholderData: false, data: undefined }));
  });

  it("retains the current page if a background refresh fails", async () => {
    vi.mocked(searchProperties).mockRejectedValueOnce(new Error("Network unavailable"));
    const observer = observeFirstPage();
    await observer.refetch();
    expect(observer.getCurrentResult()).toMatchObject({ isError: true, isFetching: false, data: firstPage });
  });
});

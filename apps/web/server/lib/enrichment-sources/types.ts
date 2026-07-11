/**
 * Per-property lookup sources (address/cadastral, soil, contamination, BBR)
 * called from enrich.ts — distinct from crawl/*.ts, which are paginated
 * listing fetchers feeding the crawl loop. A source here takes one
 * property's location/identifiers in and returns one partial payload out.
 */
export type SourceResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function sourceOk<T>(data: T): SourceResult<T> {
  return { ok: true, data };
}

export function sourceFailed<T>(error: unknown): SourceResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Deterministic seed for mock generators, shared across sources so mock output is stable across repeated calls. */
export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Structured JSON-line logging. Vercel captures stdout/stderr per invocation;
 * emitting one JSON object per line makes crawl runs searchable in the
 * dashboard (e.g. filter on `"event":"crawl.source.done"`).
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      error: err instanceof Error ? err.message : String(err),
      ...fields,
    }),
  );
}

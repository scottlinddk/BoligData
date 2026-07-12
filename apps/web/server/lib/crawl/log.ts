/**
 * Structured JSON-line logging. Vercel captures stdout/stderr per invocation;
 * emitting one JSON object per line makes crawl runs searchable in the
 * dashboard (e.g. filter on `"event":"crawl.source.done"`).
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      error: errorMessage(err),
      ...fields,
    }),
  );
}

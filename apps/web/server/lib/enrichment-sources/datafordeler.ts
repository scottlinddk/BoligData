import { fetchJson, HttpError } from "../crawl/http.js";
import { asNonEmptyString } from "../crawl/map-utils.js";

/**
 * Shared client for Datafordeler's entity-based GraphQL services (BBR via DAR,
 * VUR, Matriklen). Every one of them is the same shape: a
 * `https://graphql.datafordeler.dk/<register>/<version>` endpoint, `apiKey` as
 * a query parameter, and a `{ nodes { ... } }` connection per entity.
 *
 * Two failure modes this centralizes, both of which took a source down in
 * production:
 *
 * - **The version segment is not stable.** Registers are versioned
 *   independently and old versions are withdrawn; `DAR/v1` started answering
 *   `HTTP 404` once DAR moved to v3, which read as "the whole service is
 *   down". `postGraphQl` therefore treats a 404 as "wrong version segment",
 *   not as a fatal error, and walks the candidate versions newest-first,
 *   remembering the one that answered.
 * - **Field names are guesses until the schema says otherwise.** GraphQL
 *   rejects the entire document over one unknown field, so a single wrong
 *   guess costs every value in the query. `entityFields` reads the real
 *   spelling off the service's own schema and `pickField` matches this repo's
 *   intent against it.
 */
const DEFAULT_HOST = "https://graphql.datafordeler.dk";

export interface DatafordelerService {
  /** Register segment of the endpoint URL, e.g. `"DAR"`. */
  register: string;
  /** Env var pinning a single version segment, e.g. `"DATAFORDELER_DAR_VERSION"`. */
  versionEnv: string;
  /** Env var overriding the whole endpoint, e.g. `"DATAFORDELER_DAR_API_BASE"`. */
  baseEnv: string;
  /** Version segments to try, newest first. Only used when neither env var is set. */
  versions: readonly string[];
}

/** A document the service accepted but answered with `errors`. */
export class GraphQlError extends Error {
  constructor(public readonly messages: string[]) {
    super(messages.join("; "));
    this.name = "GraphQlError";
  }

  /**
   * Whether the rejection was about an argument the schema doesn't have.
   * Datafordeler's bitemporal `registreringstid`/`virkningstid` arguments
   * exist on some registers' query fields and not others, and the difference
   * is only visible from the error text.
   */
  get hasUnknownArgument(): boolean {
    return this.messages.some((message) => /argument\s+`?\w+`?\s+does not exist/i.test(message));
  }
}

interface GraphQlEnvelope<T> {
  data?: T | null;
  errors?: Array<{ message?: unknown }>;
}

/** Endpoint that last answered for a register, so the version walk is paid once per process. */
const resolvedBase = new Map<string, string>();

/** Introspected field names per `<register>:<type>`; `null` = the type is not in that schema. */
const fieldCache = new Map<string, Set<string> | null>();

/** Test seam — module-level caches would otherwise leak between cases. */
export function resetDatafordelerCache(): void {
  resolvedBase.clear();
  fieldCache.clear();
}

/**
 * Endpoints to try, in order. An explicit `*_API_BASE` or `*_VERSION` is taken
 * as deliberate and never probed around: an operator pinning a version wants
 * the failure, not a silent fallback to a different one.
 */
export function candidateBases(service: DatafordelerService): string[] {
  const base = process.env[service.baseEnv]?.trim();
  if (base) return [base.replace(/\/+$/, "")];

  const pinned = process.env[service.versionEnv]?.trim();
  const versions = pinned ? [pinned] : service.versions;
  return versions.map((version) => `${DEFAULT_HOST}/${service.register}/${version}`);
}

/**
 * POSTs one GraphQL document and returns its `data`. Throws `GraphQlError` for
 * a document the service rejected, `HttpError` for transport failures.
 */
export async function postGraphQl<T>(
  service: DatafordelerService,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | null> {
  const known = resolvedBase.get(service.register);
  const all = candidateBases(service);
  const bases = known ? [known, ...all.filter((base) => base !== known)] : all;

  let lastNotFound: HttpError | null = null;
  for (const base of bases) {
    const params = new URLSearchParams({ apiKey });
    let body: GraphQlEnvelope<T>;
    try {
      body = await fetchJson<GraphQlEnvelope<T>>(`${base}?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
      });
    } catch (err) {
      // A 404 means this version segment is gone, not that the register is —
      // try the next candidate before giving up.
      if (err instanceof HttpError && err.status === 404) {
        lastNotFound = err;
        continue;
      }
      throw err;
    }

    resolvedBase.set(service.register, base);
    if (body.errors?.length) {
      throw new GraphQlError(body.errors.map((e) => asNonEmptyString(e.message) ?? "unknown GraphQL error"));
    }
    return body.data ?? null;
  }

  throw (
    lastNotFound ??
    new Error(`no endpoint configured for Datafordeler register ${service.register}`)
  );
}

interface IntrospectionResponse {
  __type?: { fields?: Array<{ name?: unknown }> | null } | null;
}

/**
 * Field names the service's schema actually defines on an entity type, or
 * `null` when the schema has no such type. Cached per process — the schema
 * changes on a register release, not between requests.
 *
 * Introspection can be turned off server-side, in which case this throws and
 * callers fall back to their static field lists.
 */
export async function entityFields(
  service: DatafordelerService,
  apiKey: string,
  typeName: string,
): Promise<Set<string> | null> {
  const cacheKey = `${service.register}:${typeName}`;
  const cached = fieldCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const data = await postGraphQl<IntrospectionResponse>(
    service,
    apiKey,
    `query Introspect { __type(name: ${JSON.stringify(typeName)}) { fields { name } } }`,
  );

  const fields = data?.__type?.fields;
  const names = Array.isArray(fields)
    ? new Set(fields.map((field) => asNonEmptyString(field.name)).filter((name): name is string => name !== null))
    : null;

  const result = names === null || names.size === 0 ? null : names;
  fieldCache.set(cacheKey, result);
  return result;
}

/**
 * Folds a field name onto the form this repo searches by: lowercase ASCII with
 * Datafordeler's Danish transliteration (å->aa, æ->ae, ø->oe) applied, so
 * `byg026Opfoerelsesaar`, `Opførelsesår` and `opfoerelsesaar` all compare equal
 * on the part that matters.
 */
export function foldFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/å/g, "aa")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Finds the schema's own spelling for a value this repo wants, given one or
 * more folded search terms in preference order.
 *
 * An exact fold match anywhere in the term list beats a prefix match, and
 * among prefix matches the shortest field wins, so a register that spells the
 * value `ejendomsvaerdiBeloeb` still resolves. Matching is deliberately
 * anchored at the start rather than `includes`: a substring match would
 * happily return `omraadeGrundvaerdiKode` for `grundvaerdi` and this repo
 * would print a zone code as an assessed value in kroner.
 */
export function pickField(fields: Iterable<string>, ...terms: string[]): string | null {
  const names = [...fields];
  const folded = new Map(names.map((name) => [name, foldFieldName(name)]));

  for (const term of terms) {
    const exact = names.find((name) => folded.get(name) === term);
    if (exact !== undefined) return exact;
  }

  for (const term of terms) {
    const prefixed = names
      .filter((name) => folded.get(name)?.startsWith(term) === true)
      .sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (prefixed[0] !== undefined) return prefixed[0];
  }

  return null;
}

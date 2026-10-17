import type { NewListingsRun } from "../../../../../packages/shared/src/types/api.js";

const WORKFLOW_FILE = "new-listings.yml";
const DEFAULT_REPOSITORY = "scottlinddk/boligdata";
const DEFAULT_REF = "main";
const RUNS_LIMIT = 5;
const GITHUB_TIMEOUT_MS = 10_000;

/** Thrown for GitHub failures; `status` is what the admin API should answer with. */
export class GithubWorkflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(message);
  }
}

interface GithubRunPayload {
  id: number;
  run_number: number;
  status: string | null;
  conclusion: string | null;
  event: string;
  created_at: string;
  html_url: string;
}

function config() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    throw new GithubWorkflowError(
      "GITHUB_DISPATCH_TOKEN is not set",
      503,
      "GitHub Actions is not configured (missing GITHUB_DISPATCH_TOKEN)",
    );
  }
  const repository = process.env.ADMIN_WORKFLOW_REPOSITORY || DEFAULT_REPOSITORY;
  const ref = process.env.ADMIN_WORKFLOW_REF || DEFAULT_REF;
  return { token, ref, base: `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}` };
}

async function githubFetch(url: string, init: RequestInit & { token: string }): Promise<Response> {
  const { token, ...rest } = init;
  try {
    return await fetch(url, {
      ...rest,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "boligdata-admin",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GithubWorkflowError(
      `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`,
      502,
      "Could not reach GitHub",
    );
  }
}

function mapRun(run: GithubRunPayload): NewListingsRun {
  return {
    id: run.id,
    runNumber: run.run_number,
    status: run.status ?? "unknown",
    conclusion: run.conclusion,
    trigger: run.event === "workflow_dispatch" ? "manual" : "scheduled",
    createdAt: run.created_at,
    url: run.html_url,
  };
}

export function isRunActive(run: NewListingsRun): boolean {
  return run.status !== "completed";
}

/** The most recent runs of the new-listings workflow, newest first. */
export async function listNewListingsRuns(): Promise<NewListingsRun[]> {
  const { token, base } = config();
  const response = await githubFetch(`${base}/runs?per_page=${RUNS_LIMIT}`, { token });
  if (!response.ok) {
    throw new GithubWorkflowError(
      `GitHub runs lookup answered ${response.status}`,
      502,
      "Failed to load GitHub Actions runs",
    );
  }
  const body = (await response.json()) as { workflow_runs?: GithubRunPayload[] };
  return (body.workflow_runs ?? []).map(mapRun);
}

/**
 * Dispatches the new-listings workflow. Refuses while a run is queued or in
 * progress: the workflow shares the production concurrency group, so a second
 * dispatch would only queue behind the first and run the same ingest twice.
 */
export async function dispatchNewListingsWorkflow(): Promise<void> {
  const { token, ref, base } = config();
  const runs = await listNewListingsRuns();
  if (runs.some(isRunActive)) {
    throw new GithubWorkflowError("A run is already active", 409, "A fetch is already queued or running");
  }
  const response = await githubFetch(`${base}/dispatches`, {
    method: "POST",
    token,
    body: JSON.stringify({ ref }),
  });
  if (response.status !== 204) {
    throw new GithubWorkflowError(
      `GitHub dispatch answered ${response.status}`,
      502,
      "GitHub rejected the workflow dispatch",
    );
  }
}

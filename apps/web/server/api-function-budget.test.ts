import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vercel's zero-config builds turn every file it uploads under api/ into its
 * own Serverless Function, and the Hobby plan caps a deployment at 12. This
 * project sits at exactly 12 real endpoints, so anything extra landing in
 * api/ — a helper, a fixture, a *.test.ts — fails the deploy with:
 *
 *   No more than 12 Serverless Functions can be added to a Deployment on the
 *   Hobby plan. Create a team (Pro plan) to deploy more.
 *
 * .github/workflows/deploy.yml runs no checks before `vercel build`, so
 * without this test the budget is only enforced after a merge to main.
 * Shared code belongs in server/, tests alongside it.
 */
const HOBBY_PLAN_FUNCTION_LIMIT = 12;

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../api");
const RUNTIME_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

function listApiFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listApiFiles(path.join(dir, entry.name), rel);
    return RUNTIME_EXTENSIONS.includes(path.extname(entry.name)) ? [rel] : [];
  });
}

describe("Vercel serverless function budget", () => {
  const apiFiles = listApiFiles(API_DIR);

  it(`keeps api/ at or under the ${HOBBY_PLAN_FUNCTION_LIMIT}-function Hobby cap`, () => {
    expect(apiFiles.length, `api/ currently holds:\n  ${apiFiles.join("\n  ")}`).toBeLessThanOrEqual(
      HOBBY_PLAN_FUNCTION_LIMIT,
    );
  });

  it("keeps test files out of api/, where they would each burn a function slot", () => {
    expect(apiFiles.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
  });
});

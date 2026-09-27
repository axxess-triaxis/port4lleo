/**
 * Collector smoke test against the real GitHub API, with no database involved.
 *
 *   pnpm smoke <login> [--private]
 *
 * Token: $GITHUB_TOKEN, else `gh auth token` (read at runtime, never written anywhere).
 */
import { execFileSync } from "node:child_process";
import { createGitHubClient } from "../src/lib/github/client";
import { collectBuilderMetrics } from "../src/lib/github/collect";
import { computeScore } from "../src/lib/scoring/score";

async function main() {
  const login = process.argv[2];
  if (!login) throw new Error("usage: pnpm smoke <login> [--private]");
  const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  const started = Date.now();
  const metrics = await collectBuilderMetrics(createGitHubClient(token), {
    login,
    includePrivate: process.argv.includes("--private"),
  });
  const score = computeScore(metrics);
  const { calendar, ...rest } = metrics;
  console.log(
    JSON.stringify(
      {
        ...rest,
        calendar: `${calendar.length} days`,
        appsBuilt: metrics.appsBuilt.map((r) => `${r.nameWithOwner} (${r.reason})`),
        appsDeployed: metrics.appsDeployed.map((r) => `${r.nameWithOwner} (${r.reason})`),
        vercelProjects: metrics.vercelProjects.map((r) => r.nameWithOwner),
        hackathons: metrics.hackathons.map((r) => `${r.nameWithOwner} (${r.reason})`),
        prototypes: metrics.prototypes.map((r) => `${r.nameWithOwner} (${r.reason})`),
      },
      null,
      2,
    ),
  );
  console.log("\nScore:", score.score, score.tier);
  for (const m of score.metrics) console.log(`  ${m.label.padEnd(18)} raw=${String(m.raw).padStart(6)}  pts=${m.points.toFixed(1)}/${m.maxPoints}`);
  console.log(`\nCollected in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Repo-level governance checks, ported from RepoWatch (github.com/axxess-triaxis/RepoWatch,
 * src/repowatch/checks). Thresholds and heuristics are kept; each check takes a
 * GitHubClient and reports failures in `error` instead of throwing.
 */
import { GitHubError, type GitHubClient } from "@/lib/github/client";
import type { ConflictMergeResult, DependabotResult, StalePrResult, UntestedDeployResult } from "./types";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface AlertJson {
  state: string;
  html_url?: string;
  security_advisory?: { summary?: string };
  security_vulnerability?: { severity?: string; package?: { name?: string } };
}

export async function checkDependabot(gh: GitHubClient, repo: string): Promise<DependabotResult> {
  const result: DependabotResult = { findings: [], disabled: false, accessDenied: false, error: null };
  let alerts: AlertJson[];
  try {
    alerts = await gh.restAll<AlertJson>(`/repos/${repo}/dependabot/alerts?state=open&per_page=100`);
  } catch (e) {
    // Both are 403s, but "never enabled" is a governance gap while "can't read" is unknown;
    // neither may be reported as clean.
    if (/disabled for this repository/i.test(msg(e))) result.disabled = true;
    else if (e instanceof GitHubError && e.status === 403) result.accessDenied = true;
    else result.error = msg(e);
    return result;
  }
  for (const a of alerts) {
    if (a.state !== "open" || !a.security_vulnerability) continue;
    result.findings.push({
      severity: a.security_vulnerability.severity ?? "unknown",
      package: a.security_vulnerability.package?.name ?? "unknown",
      summary: a.security_advisory?.summary ?? "",
      url: a.html_url ?? "",
    });
  }
  return result;
}

export const DEFAULT_STALE_DAYS = 10;

export function ageDays(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export async function checkStalePrs(
  gh: GitHubClient,
  repo: string,
  now = new Date(),
  thresholdDays = DEFAULT_STALE_DAYS,
): Promise<StalePrResult> {
  try {
    const prs = await gh.restAll<{ number: number; title: string; created_at: string; html_url: string }>(
      `/repos/${repo}/pulls?state=open&per_page=100`,
      200,
    );
    return {
      stale: prs
        .map((p) => ({ number: p.number, title: p.title, daysOpen: ageDays(p.created_at, now), url: p.html_url }))
        .filter((p) => p.daysOpen > thresholdDays),
      error: null,
    };
  } catch (e) {
    return { stale: [], error: msg(e) };
  }
}

export interface CommitJson {
  sha: string;
  html_url?: string;
  parents?: unknown[];
  commit?: { message?: string };
}

const summary = (c: CommitJson) => (c.commit?.message ?? "").split("\n")[0];

/**
 * A lower bound: flags merge commits whose message still carries git's "Conflicts:"
 * marker. Edited messages and squash merges are missed.
 */
export function findConflictMerges(commits: CommitJson[]): ConflictMergeResult["findings"] {
  return commits
    .filter((c) => (c.parents?.length ?? 0) > 1 && (c.commit?.message ?? "").includes("Conflicts:"))
    .map((c) => ({ sha: c.sha.slice(0, 8), messageSummary: summary(c), url: c.html_url ?? "" }));
}

export async function fetchRecentCommits(gh: GitHubClient, repo: string, count: number): Promise<CommitJson[]> {
  return gh.rest<CommitJson[]>(`/repos/${repo}/commits?per_page=${Math.min(count, 100)}`);
}

/** RepoWatch matched only playwright/vitest (AXXESS's stack); broadened for general use. */
export const DEFAULT_TEST_MARKERS = ["playwright", "vitest", "jest", "pytest", "cypress", "test"];

/**
 * Name-based on purpose: a failing test run still proves the suite ran, which is a
 * different (and louder) problem than it never running, so it is reported separately.
 */
export async function checkUntestedDeploys(
  gh: GitHubClient,
  repo: string,
  commits: CommitJson[],
  markers = DEFAULT_TEST_MARKERS,
): Promise<UntestedDeployResult> {
  const result: UntestedDeployResult = { findings: [], commitsChecked: 0, error: null };
  for (const c of commits) {
    let runs: { name?: string; conclusion?: string | null }[];
    try {
      runs = (await gh.rest<{ check_runs: typeof runs }>(`/repos/${repo}/commits/${c.sha}/check-runs?per_page=100`))
        .check_runs;
    } catch {
      continue; // one unreadable commit shouldn't kill the scan
    }
    result.commitsChecked++;
    const matching = runs.filter((r) => markers.some((m) => (r.name ?? "").toLowerCase().includes(m)));
    const base = { sha: c.sha.slice(0, 8), messageSummary: summary(c), url: c.html_url ?? "" };
    if (matching.length === 0) result.findings.push({ ...base, reason: "no_test_run" });
    else if (matching.every((r) => r.conclusion !== "success")) result.findings.push({ ...base, reason: "test_run_failed" });
  }
  return result;
}

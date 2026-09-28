import pLimit from "p-limit";
import type { GitHubClient } from "@/lib/github/client";
import { checkDependabot, checkStalePrs, checkUntestedDeploys, fetchRecentCommits, findConflictMerges } from "./checks";
import { checkPii } from "./pii";
import { checkSprawl } from "./sprawl";
import type { AuditLimits, AuditReport, AuditSummary, RepoAudit } from "./types";

/** Caps keep one audit inside a 300 s serverless budget and the 5,000 req/h installation limit. */
export const DEFAULT_LIMITS: AuditLimits = { maxRepos: 25, commitLookback: 10, maxPiiFiles: 40 };

export interface InstallationRepo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  pushed_at: string | null;
}

/** GET /installation/repositories returns an object, not an array, so it pages by count. */
export async function listInstallationRepos(gh: GitHubClient, cap = 500): Promise<InstallationRepo[]> {
  const out: InstallationRepo[] = [];
  for (let page = 1; out.length < cap; page++) {
    const body = await gh.rest<{ total_count: number; repositories: InstallationRepo[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
    );
    out.push(...body.repositories);
    if (body.repositories.length < 100 || out.length >= body.total_count) break;
  }
  return out.slice(0, cap);
}

async function auditRepo(gh: GitHubClient, r: InstallationRepo, limits: AuditLimits, now: Date): Promise<RepoAudit> {
  const repo = r.full_name;
  // One commits fetch serves both commit-based checks (conflict markers look back 100).
  const commits = await fetchRecentCommits(gh, repo, 100).catch((e: unknown) => e);
  const commitError = commits instanceof Error ? commits.message : null;
  const list = Array.isArray(commits) ? commits : [];

  const [dependabot, stalePrs, untested, pii] = await Promise.all([
    checkDependabot(gh, repo),
    checkStalePrs(gh, repo, now),
    commitError
      ? Promise.resolve({ findings: [], commitsChecked: 0, error: commitError })
      : checkUntestedDeploys(gh, repo, list.slice(0, limits.commitLookback)),
    checkPii(gh, repo, r.default_branch, limits.maxPiiFiles),
  ]);
  return {
    repo,
    url: r.html_url,
    private: r.private,
    dependabot,
    stalePrs,
    conflictMerges: { findings: commitError ? [] : findConflictMerges(list), error: commitError },
    untestedDeploys: untested,
    pii,
  };
}

export async function runAudit(
  gh: GitHubClient,
  account: string,
  limits: AuditLimits = DEFAULT_LIMITS,
  now = new Date(),
): Promise<AuditReport> {
  const startedAt = new Date().toISOString();
  const all = await listInstallationRepos(gh);
  const targets = all
    .filter((r) => !r.archived)
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, limits.maxRepos);
  const limit = pLimit(3);
  const repos = await Promise.all(targets.map((r) => limit(() => auditRepo(gh, r, limits, now))));
  return {
    schemaVersion: 1,
    account,
    startedAt,
    finishedAt: new Date().toISOString(),
    limits,
    reposInInstallation: all.length,
    repos,
    sprawl: checkSprawl(all),
  };
}

export function summarize(report: AuditReport): AuditSummary {
  const s: AuditSummary = {
    reposAudited: report.repos.length,
    dependabotOpen: 0,
    dependabotCriticalHigh: 0,
    dependabotDisabled: 0,
    stalePrs: 0,
    conflictMerges: 0,
    untestedCommits: 0,
    piiFindings: 0,
    nearDuplicates: report.sprawl.nearDuplicates.length,
    checkErrors: 0,
  };
  for (const r of report.repos) {
    s.dependabotOpen += r.dependabot.findings.length;
    s.dependabotCriticalHigh += r.dependabot.findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
    if (r.dependabot.disabled) s.dependabotDisabled++;
    s.stalePrs += r.stalePrs.stale.length;
    s.conflictMerges += r.conflictMerges.findings.length;
    s.untestedCommits += r.untestedDeploys.findings.length;
    s.piiFindings += r.pii.findings.filter((f) => !f.likelyBenign).length;
    for (const c of [r.dependabot, r.stalePrs, r.conflictMerges, r.untestedDeploys, r.pii]) if (c.error) s.checkErrors++;
    if (r.dependabot.accessDenied) s.checkErrors++;
  }
  return s;
}

/**
 * Security boundary: an org member may not have access to every repo in the
 * installation. Strip everything about repos the viewer cannot access, including
 * near-duplicate pairs that would reveal a private repo's name.
 */
export function filterReportForViewer(report: AuditReport, accessibleFullNames: Iterable<string>): AuditReport {
  const allowed = new Set([...accessibleFullNames].map((n) => n.toLowerCase()));
  const owner = report.account.toLowerCase();
  const nameAllowed = (name: string) => allowed.has(`${owner}/${name.toLowerCase()}`);
  return {
    ...report,
    repos: report.repos.filter((r) => allowed.has(r.repo.toLowerCase())),
    sprawl: {
      ...report.sprawl,
      nearDuplicates: report.sprawl.nearDuplicates.filter((d) => nameAllowed(d.repoA) && nameAllowed(d.repoB)),
    },
  };
}

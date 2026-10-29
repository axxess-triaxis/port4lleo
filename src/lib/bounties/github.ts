import type { GitHubClient } from "@/lib/github/client";
import type { FixEvidence } from "./model";

/**
 * Collects what GitHub reports about a claimed fix, with PORT4LLEO's own installation token
 * (never the claimant's). Missing pieces become null so the hard checks fail closed.
 */

interface RepoJson {
  default_branch: string;
  private: boolean;
}
interface AlertJson {
  state: string;
  fixed_at: string | null;
  security_vulnerability?: { severity?: string; package?: { name?: string } };
}
interface PullJson {
  user: { login: string } | null;
  merged: boolean;
  merged_at: string | null;
  base: { ref: string; repo: { full_name: string } };
}
interface PullFileJson {
  filename: string;
  status: string;
  patch?: string;
}

export async function collectFixEvidence(
  gh: GitHubClient,
  input: { repo: string; alertNumber: number; prNumber: number; claimantLogin: string; fundedAt: string },
): Promise<{ evidence: FixEvidence; files: PullFileJson[] }> {
  const repo = await gh.rest<RepoJson>(`/repos/${input.repo}`);
  const alert = await gh.rest<AlertJson>(`/repos/${input.repo}/dependabot/alerts/${input.alertNumber}`).catch(() => null);
  const pull = await gh.rest<PullJson>(`/repos/${input.repo}/pulls/${input.prNumber}`).catch(() => null);
  const files = pull ? await gh.restAll<PullFileJson>(`/repos/${input.repo}/pulls/${input.prNumber}/files?per_page=100`, 100).catch(() => []) : [];

  return {
    evidence: {
      bountyRepo: input.repo,
      alertNumber: input.alertNumber,
      claimantLogin: input.claimantLogin,
      fundedAt: input.fundedAt,
      defaultBranch: repo.default_branch,
      alert: alert
        ? {
            state: alert.state,
            fixedAt: alert.fixed_at,
            package: alert.security_vulnerability?.package?.name ?? "unknown",
            severity: alert.security_vulnerability?.severity ?? "unknown",
          }
        : null,
      pullRequest: pull
        ? {
            repo: pull.base.repo.full_name,
            number: input.prNumber,
            authorLogin: pull.user?.login ?? "",
            merged: pull.merged,
            mergedAt: pull.merged_at,
            baseRef: pull.base.ref,
            filesChanged: files.map((f) => f.filename),
          }
        : null,
    },
    files,
  };
}

/** Repository permission of a *viewer* (their own user token): may they fund or approve? */
export async function viewerCanManage(viewerGh: GitHubClient, repo: string): Promise<{ ok: boolean; private: boolean }> {
  const r = await viewerGh
    .rest<{ private: boolean; permissions?: { admin?: boolean; maintain?: boolean } }>(`/repos/${repo}`)
    .catch(() => null);
  if (!r) return { ok: false, private: true };
  return { ok: !!(r.permissions?.admin || r.permissions?.maintain), private: r.private };
}

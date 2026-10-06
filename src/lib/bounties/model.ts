/**
 * Fix bounties: pure rules (no I/O), shared by routes, the agent and tests.
 *
 *   draft --pay--> funded --claim--> claimed --verify(pass)--> verified --approve--> paid
 *     |              |                  ^  |                      |
 *     cancel         cancel(refund)     |  verify(fail) stays     reject
 *     v              v                  +-- claimed               v
 *   cancelled      refunded                                     funded (claim cleared)
 *
 * The AI agent never moves money. Payout needs: every hard check passing, the agent
 * recommending "pay", and a human with admin/maintain on the repo approving.
 */

export type BountyStatus = "draft" | "funded" | "claimed" | "verified" | "paid" | "cancelled" | "refunded";

export type BountyAction = "fund" | "claim" | "verify_pass" | "verify_fail" | "approve" | "reject" | "cancel";

const TRANSITIONS: Record<BountyAction, Partial<Record<BountyStatus, BountyStatus>>> = {
  fund: { draft: "funded" },
  claim: { funded: "claimed" },
  verify_pass: { claimed: "verified" },
  verify_fail: { claimed: "claimed" },
  approve: { verified: "paid" },
  reject: { claimed: "funded", verified: "funded" },
  cancel: { draft: "cancelled", funded: "refunded" },
};

/** The status after `action`, or null when the action is not allowed from `from`. */
export function nextStatus(from: BountyStatus, action: BountyAction): BountyStatus | null {
  return TRANSITIONS[action][from] ?? null;
}

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 500;

/** "25", "25.5", "25.50" -> "25.50"; anything else (or out of range) -> null. */
export function parseAmount(input: unknown): string | null {
  const s = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (n < MIN_AMOUNT || n > MAX_AMOUNT) return null;
  return n.toFixed(2);
}

/** Dependabot alert number from its html_url (…/security/dependabot/123). */
export function alertNumberFromUrl(url: string): number | null {
  const m = /\/security\/dependabot\/(\d+)(?:[/?#]|$)/.exec(url);
  return m ? Number(m[1]) : null;
}

/** "https://github.com/owner/repo/pull/42" -> {repo:"owner/repo", number:42}. */
export function parsePullRequestUrl(url: string): { repo: string; number: number } | null {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?(?:[?#].*)?$/.exec(url.trim());
  return m ? { repo: m[1], number: Number(m[2]) } : null;
}

export function isPlausibleEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** "jane.doe@example.com" -> "ja…@example.com", for display and logs. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}…@${domain ?? ""}`;
}

// ---------------------------------------------------------------- verification

/** What GitHub says, fetched by lib/bounties/github.ts. */
export interface FixEvidence {
  bountyRepo: string;
  alertNumber: number;
  claimantLogin: string;
  fundedAt: string;
  alert: { state: string; fixedAt: string | null; package: string; severity: string } | null;
  pullRequest: {
    repo: string;
    number: number;
    authorLogin: string;
    merged: boolean;
    mergedAt: string | null;
    baseRef: string;
    filesChanged: string[];
  } | null;
  defaultBranch: string;
}

export interface HardCheck {
  id: "pr_in_repo" | "pr_merged" | "pr_into_default_branch" | "author_is_claimant" | "merged_after_funding" | "alert_fixed";
  passed: boolean;
  detail: string;
}

/** Deterministic checks. A payout is impossible unless every one passes, whatever the agent says. */
export function evaluateHardChecks(e: FixEvidence): HardCheck[] {
  const pr = e.pullRequest;
  const checks: HardCheck[] = [];
  checks.push({
    id: "pr_in_repo",
    passed: !!pr && pr.repo.toLowerCase() === e.bountyRepo.toLowerCase(),
    detail: pr ? `PR is in ${pr.repo}` : "pull request not found",
  });
  checks.push({
    id: "pr_merged",
    passed: !!pr?.merged,
    detail: pr?.merged ? `merged ${pr.mergedAt}` : "not merged",
  });
  checks.push({
    id: "pr_into_default_branch",
    passed: !!pr && pr.baseRef === e.defaultBranch,
    detail: pr ? `base ${pr.baseRef}, default ${e.defaultBranch}` : "pull request not found",
  });
  checks.push({
    id: "author_is_claimant",
    passed: !!pr && pr.authorLogin.toLowerCase() === e.claimantLogin.toLowerCase(),
    detail: pr ? `author ${pr.authorLogin}, claimant ${e.claimantLogin}` : "pull request not found",
  });
  checks.push({
    id: "merged_after_funding",
    passed: !!pr?.mergedAt && new Date(pr.mergedAt).getTime() >= new Date(e.fundedAt).getTime(),
    detail: pr?.mergedAt ? `merged ${pr.mergedAt}, funded ${e.fundedAt}` : "not merged",
  });
  // GitHub itself marks a Dependabot alert "fixed" once the vulnerable dependency is updated
  // on the default branch -- an independent signal the agent cannot fabricate.
  checks.push({
    id: "alert_fixed",
    passed: e.alert?.state === "fixed",
    detail: e.alert ? `alert #${e.alertNumber} is ${e.alert.state}` : "alert not readable",
  });
  return checks;
}

export function allPassed(checks: HardCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.passed);
}

export interface AgentReport {
  recommendation: "pay" | "reject";
  confidence: number;
  reasons: string[];
  risks: string[];
  /** PayPal order state the agent read through the Agent Toolkit (e.g. "COMPLETED"). */
  paypalOrderStatus: string | null;
  model: string;
  toolCalls: string[];
}

/**
 * The final recommendation stored on the bounty. A failed hard check or an order PayPal
 * doesn't report as COMPLETED forces "reject" even if the agent said "pay".
 */
export function finalRecommendation(checks: HardCheck[], agent: AgentReport | null): "pay" | "reject" {
  if (!allPassed(checks)) return "reject";
  if (!agent) return "reject";
  if (agent.paypalOrderStatus !== "COMPLETED") return "reject";
  return agent.recommendation;
}

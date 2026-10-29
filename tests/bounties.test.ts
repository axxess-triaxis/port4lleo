import { describe, expect, it } from "vitest";
import {
  alertNumberFromUrl,
  allPassed,
  evaluateHardChecks,
  finalRecommendation,
  maskEmail,
  nextStatus,
  parseAmount,
  parsePullRequestUrl,
  type AgentReport,
  type FixEvidence,
} from "@/lib/bounties/model";

const evidence = (over: Partial<FixEvidence> = {}): FixEvidence => ({
  bountyRepo: "acme/web",
  alertNumber: 7,
  claimantLogin: "dev",
  fundedAt: "2026-10-06T10:00:00Z",
  defaultBranch: "main",
  alert: { state: "fixed", fixedAt: "2026-10-07T10:00:00Z", package: "next", severity: "critical" },
  pullRequest: {
    repo: "acme/web",
    number: 42,
    authorLogin: "Dev",
    merged: true,
    mergedAt: "2026-10-07T09:00:00Z",
    baseRef: "main",
    filesChanged: ["package.json", "pnpm-lock.yaml"],
  },
  ...over,
});

const agent = (over: Partial<AgentReport> = {}): AgentReport => ({
  recommendation: "pay",
  confidence: 0.9,
  reasons: ["lockfile bumps the vulnerable package"],
  risks: [],
  paypalOrderStatus: "COMPLETED",
  model: "openai/gpt-oss-120b",
  toolCalls: ["get_order"],
  ...over,
});

describe("bounty status flow", () => {
  it("follows draft -> funded -> claimed -> verified -> paid", () => {
    expect(nextStatus("draft", "fund")).toBe("funded");
    expect(nextStatus("funded", "claim")).toBe("claimed");
    expect(nextStatus("claimed", "verify_pass")).toBe("verified");
    expect(nextStatus("verified", "approve")).toBe("paid");
  });

  it("refuses to pay anything that was not verified", () => {
    for (const s of ["draft", "funded", "claimed", "paid", "cancelled", "refunded"] as const) {
      expect(nextStatus(s, "approve")).toBeNull();
    }
  });

  it("cancelling refunds a funded bounty but cannot touch a claimed or paid one", () => {
    expect(nextStatus("draft", "cancel")).toBe("cancelled");
    expect(nextStatus("funded", "cancel")).toBe("refunded");
    expect(nextStatus("claimed", "cancel")).toBeNull();
    expect(nextStatus("paid", "cancel")).toBeNull();
  });

  it("rejecting a claim reopens the bounty", () => {
    expect(nextStatus("verified", "reject")).toBe("funded");
    expect(nextStatus("claimed", "reject")).toBe("funded");
  });
});

describe("input parsing", () => {
  it("normalises amounts within 1-500 and rejects the rest", () => {
    expect(parseAmount("25")).toBe("25.00");
    expect(parseAmount(25.5)).toBe("25.50");
    expect(parseAmount("0.99")).toBeNull();
    expect(parseAmount("501")).toBeNull();
    expect(parseAmount("1e2")).toBeNull();
    expect(parseAmount("10.123")).toBeNull();
  });

  it("reads alert numbers and PR URLs strictly", () => {
    expect(alertNumberFromUrl("https://github.com/acme/web/security/dependabot/12")).toBe(12);
    expect(alertNumberFromUrl("https://github.com/acme/web/pull/12")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/acme/web/pull/42")).toEqual({ repo: "acme/web", number: 42 });
    expect(parsePullRequestUrl("https://evil.example/acme/web/pull/42")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/acme/web/issues/42")).toBeNull();
  });

  it("masks payout emails for display", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("ja…@example.com");
  });
});

describe("hard checks", () => {
  it("pass for a merged PR by the claimant that fixed the alert after funding", () => {
    expect(allPassed(evaluateHardChecks(evidence()))).toBe(true);
  });

  it.each([
    ["alert still open", { alert: { state: "open", fixedAt: null, package: "next", severity: "critical" } }, "alert_fixed"],
    ["PR by someone else", { claimantLogin: "mallory" }, "author_is_claimant"],
    ["PR in another repo", { bountyRepo: "acme/api" }, "pr_in_repo"],
    ["merged before funding", { fundedAt: "2026-10-08T00:00:00Z" }, "merged_after_funding"],
    ["unmerged PR", { pullRequest: { ...evidence().pullRequest!, merged: false, mergedAt: null } }, "pr_merged"],
    ["PR into a side branch", { pullRequest: { ...evidence().pullRequest!, baseRef: "dev" } }, "pr_into_default_branch"],
  ] as const)("fail when the %s", (_name, over, failing) => {
    const checks = evaluateHardChecks(evidence(over as Partial<FixEvidence>));
    expect(allPassed(checks)).toBe(false);
    expect(checks.find((c) => c.id === failing)?.passed).toBe(false);
  });
});

describe("final recommendation", () => {
  const passing = evaluateHardChecks(evidence());

  it("follows the agent only when every hard check passes and PayPal shows the order captured", () => {
    expect(finalRecommendation(passing, agent())).toBe("pay");
    expect(finalRecommendation(passing, agent({ recommendation: "reject" }))).toBe("reject");
  });

  it("an agent saying pay cannot override a failed hard check, a missing report or an uncaptured order", () => {
    const failing = evaluateHardChecks(evidence({ claimantLogin: "mallory" }));
    expect(finalRecommendation(failing, agent())).toBe("reject");
    expect(finalRecommendation(passing, null)).toBe("reject");
    expect(finalRecommendation(passing, agent({ paypalOrderStatus: "APPROVED" }))).toBe("reject");
  });
});

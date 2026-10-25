import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitHubError, type GitHubClient } from "@/lib/github/client";
import { listAccountRepos, runAudit } from "@/lib/governance/audit";
import {
  activityCommand,
  auditHeadline,
  compact,
  localDate,
  parseArgs,
  resolveToken,
  UsageError,
  validatePortfolio,
  writeLog,
} from "@/plugin/cli";

/** A GitHubClient whose REST answers come from a path -> value (or Error) map. */
function fakeClient(routes: Record<string, unknown>): GitHubClient & { calls: string[] } {
  const calls: string[] = [];
  const answer = (path: string) => {
    calls.push(path);
    // Longest matching prefix wins, so "/user" never answers for "/users/...".
    const key = Object.keys(routes)
      .filter((k) => path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) throw new GitHubError(`GET ${path} -> 404`, 404);
    const v = routes[key];
    if (v instanceof Error) throw v;
    return v;
  };
  return {
    calls,
    graphql: async () => {
      throw new Error("not used");
    },
    rest: async <T,>(path: string) => answer(path) as T,
    restAll: async <T,>(path: string) => answer(path) as T[],
  };
}

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  full_name: `acme/${name}`,
  html_url: `https://github.com/acme/${name}`,
  private: false,
  archived: false,
  fork: false,
  default_branch: "main",
  pushed_at: "2026-10-20T00:00:00Z",
  ...extra,
});

describe("parseArgs", () => {
  it("splits command, positionals and flags", () => {
    expect(parseArgs(["audit", "acme", "--repos", "a,b", "--full"])).toEqual({
      command: "audit",
      positional: ["acme"],
      flags: { repos: "a,b", full: true },
    });
  });
  it("defaults to help", () => {
    expect(parseArgs([]).command).toBe("help");
  });
});

describe("resolveToken", () => {
  it("prefers GITHUB_TOKEN, then GH_TOKEN, then gh", () => {
    expect(resolveToken({ GITHUB_TOKEN: "a", GH_TOKEN: "b" }, () => "c")).toBe("a");
    expect(resolveToken({ GH_TOKEN: "b" }, () => "c")).toBe("b");
    expect(resolveToken({}, () => "c\n")).toBe("c");
  });
  it("explains how to fix a missing token", () => {
    expect(() =>
      resolveToken({}, () => {
        throw new Error("gh not installed");
      }),
    ).toThrow(UsageError);
  });
});

describe("listAccountRepos", () => {
  it("uses the org listing for an org", async () => {
    const gh = fakeClient({ "/orgs/acme/repos": [repo("a")] });
    expect((await listAccountRepos(gh, "acme")).map((r) => r.name)).toEqual(["a"]);
  });
  it("falls back to the token owner's own repos, private included", async () => {
    const gh = fakeClient({ "/user/repos": [repo("mine", { private: true })], "/user": { login: "Acme" } });
    const repos = await listAccountRepos(gh, "acme");
    expect(repos[0].private).toBe(true);
    expect(gh.calls.some((c) => c.startsWith("/user/repos?affiliation=owner"))).toBe(true);
  });
  it("uses another user's public repos", async () => {
    const gh = fakeClient({ "/user": { login: "me" }, "/users/someone/repos": [repo("pub")] });
    expect((await listAccountRepos(gh, "someone")).map((r) => r.name)).toEqual(["pub"]);
  });
  it("does not swallow errors other than 404", async () => {
    const gh = fakeClient({ "/orgs/acme/repos": new GitHubError("GET -> 403", 403) });
    await expect(listAccountRepos(gh, "acme")).rejects.toThrow("403");
  });
});

describe("runAudit with a custom lister", () => {
  it("audits only the requested repos", async () => {
    const gh = fakeClient({
      "/repos/acme/a/commits": [],
      "/repos/acme/a/dependabot/alerts": [],
      "/repos/acme/a/pulls": [],
      "/repos/acme/a/git/trees": { tree: [], truncated: false },
    });
    const report = await runAudit(gh, "acme", undefined, new Date(), async () => [repo("a"), repo("b")], ["a"]);
    expect(report.repos.map((r) => r.repo)).toEqual(["acme/a"]);
    expect(report.reposInInstallation).toBe(2);
  });
});

describe("activityCommand", () => {
  const events = [
    { type: "PushEvent", created_at: new Date(2026, 9, 25, 10).toISOString(), repo: { name: "acme/a" } },
    { type: "PullRequestEvent", created_at: new Date(2026, 9, 25, 11).toISOString(), repo: { name: "acme/b" } },
    { type: "PushEvent", created_at: new Date(2026, 9, 24, 10).toISOString(), repo: { name: "acme/a" } },
  ];

  it("counts only the given local day, including private events for the token owner", async () => {
    const gh = fakeClient({ "/user": { login: "acme" }, "/users/acme/events?": events });
    const out = await activityCommand(gh, "acme", "2026-10-25");
    expect(out).toMatchObject({ active: true, events: 2, repos: ["acme/a", "acme/b"] });
    expect(gh.calls).toContain("/users/acme/events?per_page=100");
  });

  it("reads only public events for someone else", async () => {
    const gh = fakeClient({ "/user": { login: "me" }, "/users/acme/events/public": events });
    const out = await activityCommand(gh, "acme", "2026-10-23");
    expect(out.active).toBe(false);
    expect(gh.calls.some((c) => c.includes("/events/public"))).toBe(true);
  });
});

describe("validatePortfolio", () => {
  it("accepts a valid file", () => {
    const out = validatePortfolio("hackathons:\n  - name: SIH 2025\n    url: https://example.com/x\n");
    expect(out).toMatchObject({ valid: true, counts: { hackathons: 1 } });
  });
  it("reports why an invalid file fails", () => {
    const out = validatePortfolio("hackathons: 12");
    expect(out.valid).toBe(false);
  });
});

describe("auditHeadline", () => {
  const base = {
    reposAudited: 2,
    dependabotOpen: 0,
    dependabotCriticalHigh: 0,
    dependabotDisabled: 0,
    stalePrs: 0,
    conflictMerges: 0,
    untestedCommits: 0,
    piiFindings: 0,
    nearDuplicates: 0,
    checkErrors: 0,
  };
  it("never folds disabled alerts into a clean zero", () => {
    expect(auditHeadline("acme", { ...base, dependabotDisabled: 2 })).toContain("alerts off on 2");
    expect(auditHeadline("acme", base)).not.toContain("alerts off");
  });
});

describe("output", () => {
  it("drops the full audit report from terminal output unless --full", () => {
    const out = { account: "a", summary: {}, report: { big: true } };
    expect(compact(out, false)).toEqual({ account: "a", summary: {} });
    expect(compact(out, true)).toBe(out);
    expect(compact({ activity: {}, audit: out }, false)).toEqual({ activity: {}, audit: { account: "a", summary: {} } });
  });

  it("logs a dated report and appends to runs.jsonl", () => {
    const dir = mkdtempSync(join(tmpdir(), "p4l-"));
    const now = new Date(2026, 9, 25, 9);
    const file = writeLog(dir, "score", "acme/x", { score: 1 }, "acme: 1", now);
    expect(file).toContain(join("2026-10-25", "score-acme_x.json"));
    const line = JSON.parse(readFileSync(join(dir, "runs.jsonl"), "utf8").trim());
    expect(line).toMatchObject({ date: "2026-10-25", command: "score", headline: "acme: 1" });
  });

  it("formats local dates", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

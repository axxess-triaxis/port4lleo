import { createHmac, generateKeyPairSync, createVerify } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createGitHubClient } from "@/lib/github/client";
import { appJwt } from "@/lib/github/app";
import { diagnoseSignature, matchWebhookSource, secretFingerprint, verifySignature } from "@/lib/github/webhook";
import { filterReportForViewer, runAudit, summarize } from "@/lib/governance/audit";
import { checkDependabot, checkStalePrs, checkUntestedDeploys, findConflictMerges, skipReason } from "@/lib/governance/checks";
import { checkPii, isScannablePath, mask, scanContent } from "@/lib/governance/pii";
import { checkSprawl, normalizedLevenshtein } from "@/lib/governance/sprawl";

const API = "https://api.github.com";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const gh = () => createGitHubClient("t");
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("dependabot (RepoWatch parity)", () => {
  it("reports open alerts only", async () => {
    server.use(
      http.get(`${API}/repos/o/r/dependabot/alerts`, () =>
        HttpResponse.json([
          { state: "open", html_url: "u1", security_advisory: { summary: "proto pollution" }, security_vulnerability: { severity: "high", package: { name: "lodash" } } },
          { state: "fixed", security_vulnerability: { severity: "low", package: { name: "x" } } },
        ]),
      ),
    );
    const r = await checkDependabot(gh(), "o/r");
    expect(r.findings).toEqual([{ severity: "high", package: "lodash", summary: "proto pollution", url: "u1" }]);
    expect(r.accessDenied).toBe(false);
  });

  it("follows pagination", async () => {
    const alert = (n: string) => ({ state: "open", security_vulnerability: { severity: "low", package: { name: n } } });
    server.use(
      http.get(`${API}/repos/o/r/dependabot/alerts`, ({ request }) =>
        new URL(request.url).searchParams.get("page") === "2"
          ? HttpResponse.json([alert("b")])
          : HttpResponse.json([alert("a")], { headers: { link: `<${API}/repos/o/r/dependabot/alerts?page=2>; rel="next"` } }),
      ),
    );
    expect((await checkDependabot(gh(), "o/r")).findings.map((f) => f.package)).toEqual(["a", "b"]);
  });

  it("distinguishes disabled, access-denied and clean", async () => {
    server.use(http.get(`${API}/repos/o/r/dependabot/alerts`, () => HttpResponse.json({ message: "Dependabot alerts are disabled for this repository." }, { status: 403 })));
    const disabled = await checkDependabot(gh(), "o/r");
    expect(disabled).toMatchObject({ disabled: true, accessDenied: false, findings: [] });

    server.use(http.get(`${API}/repos/o/r/dependabot/alerts`, () => HttpResponse.json({ message: "Resource not accessible by integration" }, { status: 403 })));
    const denied = await checkDependabot(gh(), "o/r");
    expect(denied).toMatchObject({ disabled: false, accessDenied: true, findings: [] });

    server.use(http.get(`${API}/repos/o/r/dependabot/alerts`, () => HttpResponse.json([])));
    expect(await checkDependabot(gh(), "o/r")).toMatchObject({ disabled: false, accessDenied: false, error: null, findings: [] });
  });
});

describe("stale PRs", () => {
  it("flags PRs older than the threshold", async () => {
    server.use(
      http.get(`${API}/repos/o/r/pulls`, () =>
        HttpResponse.json([
          { number: 1, title: "old", created_at: "2026-09-01T00:00:00Z", html_url: "u" },
          { number: 2, title: "new", created_at: "2026-09-25T00:00:00Z", html_url: "u" },
        ]),
      ),
    );
    const r = await checkStalePrs(gh(), "o/r", new Date("2026-09-28T00:00:00Z"));
    expect(r.stale.map((p) => p.number)).toEqual([1]);
    expect(r.stale[0].daysOpen).toBe(27);
  });
});

describe("conflict-marker merges", () => {
  it("requires multiple parents and the marker", () => {
    const f = findConflictMerges([
      { sha: "a".repeat(40), parents: [1, 2], commit: { message: "Merge x\n\nConflicts:\n\tfile" } },
      { sha: "b".repeat(40), parents: [1], commit: { message: "Conflicts: in a normal commit" } },
      { sha: "c".repeat(40), parents: [1, 2], commit: { message: "Merge clean" } },
    ]);
    expect(f.map((x) => x.sha)).toEqual(["a".repeat(8)]);
  });
});

describe("untested deploys", () => {
  it("flags missing and failed test runs, passes green ones", async () => {
    const runs: Record<string, { name: string; conclusion: string }[]> = {
      ["1".repeat(40)]: [{ name: "lint", conclusion: "success" }],
      ["2".repeat(40)]: [{ name: "Playwright e2e", conclusion: "failure" }],
      ["3".repeat(40)]: [{ name: "vitest", conclusion: "success" }],
    };
    server.use(http.get(`${API}/repos/o/r/commits/:sha/check-runs`, ({ params }) => HttpResponse.json({ check_runs: runs[params.sha as string] })));
    const commits = Object.keys(runs).map((sha) => ({ sha, commit: { message: "m" } }));
    const r = await checkUntestedDeploys(gh(), "o/r", commits);
    const reasons = Object.fromEntries(r.findings.map((f) => [f.sha, f.reason]));
    expect(reasons).toEqual({ "11111111": "no_test_run", "22222222": "test_run_failed" });
    expect(r.commitsChecked).toBe(3);
  });
});

describe("untested deploys ignore bot and skip-ci commits", () => {
  const c = (message: string, extra: Partial<Parameters<typeof skipReason>[0]> = {}) => ({ sha: "a".repeat(40), commit: { message }, ...extra });

  it("recognises skip keywords, the skip-checks trailer and the [skip github action] variant", () => {
    expect(skipReason(c("Update metrics.svg - [Skip GitHub Action]"))).toBe("skip-ci"); // seen in the live audit
    expect(skipReason(c("docs: typo [skip ci]"))).toBe("skip-ci");
    expect(skipReason(c("chore [ci skip]"))).toBe("skip-ci");
    expect(skipReason(c("bump\n\nskip-checks: true"))).toBe("skip-ci");
    expect(skipReason(c("Fix the skip ci parser"))).toBeNull(); // the words alone don't count
  });

  it("recognises bot authors by account type, login or git author name", () => {
    expect(skipReason(c("Bump x", { author: { login: "dependabot[bot]", type: "Bot" } }))).toBe("bot");
    expect(skipReason(c("Update", { author: null, commit: { message: "Update", author: { name: "github-actions[bot]" } } }))).toBe("bot");
    expect(skipReason(c("Real work", { author: { login: "octo", type: "User" } }))).toBeNull();
  });

  it("skips them without fetching check runs, and reports how many were skipped", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/repos/o/r/commits/:sha/check-runs`, () => {
        calls++;
        return HttpResponse.json({ check_runs: [] });
      }),
    );
    const r = await checkUntestedDeploys(gh(), "o/r", [
      { sha: "1".repeat(40), commit: { message: "Update metrics.svg - [Skip GitHub Action]" } },
      { sha: "2".repeat(40), author: { login: "dependabot[bot]", type: "Bot" }, commit: { message: "Bump lodash" } },
      { sha: "3".repeat(40), commit: { message: "Ship feature" } },
    ]);
    expect(calls).toBe(1);
    expect(r).toMatchObject({ commitsChecked: 1, commitsSkipped: 2 });
    expect(r.findings.map((f) => f.sha)).toEqual(["33333333"]);
  });
});

describe("PII scan", () => {
  it("masks matches and never leaks the raw value", () => {
    const f = scanContent("src/config.ts", "const owner = 'jane.doe@example.com';");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "email", likelyBenign: false });
    expect(f[0].maskedExcerpt).not.toContain("@");
    expect(f[0].maskedExcerpt.startsWith("ja")).toBe(true);
    expect(mask("abcd")).toBe("****");
  });

  it("flags benign paths and skips binaries / oversized / vendored files", () => {
    expect(scanContent("tests/fixtures/users.json", "a@b.io")[0].likelyBenign).toBe(true);
    expect(isScannablePath("logo.png", 10)).toBe(false);
    expect(isScannablePath("big.txt", 300_000)).toBe(false);
    expect(isScannablePath("node_modules/x/index.js", 10)).toBe(false);
    expect(isScannablePath("src/a.ts", 10)).toBe(true);
  });

  it("scans the tree and counts only readable text blobs", async () => {
    server.use(
      http.get(`${API}/repos/o/r/git/trees/main`, () =>
        HttpResponse.json({
          tree: [
            { path: "src/a.ts", type: "blob", sha: "s1", size: 50 },
            { path: "img.png", type: "blob", sha: "s2", size: 50 },
            { path: "src", type: "tree", sha: "s3" },
          ],
        }),
      ),
      http.get(`${API}/repos/o/r/git/blobs/s1`, () => HttpResponse.json({ encoding: "base64", content: b64("ssn 123-45-6789") })),
    );
    const r = await checkPii(gh(), "o/r", "main");
    expect(r.filesScanned).toBe(1);
    expect(r.findings.map((f) => f.kind)).toContain("ssn_us");
    expect(JSON.stringify(r)).not.toContain("123-45-6789");
  });
});

describe("repo sprawl", () => {
  it("flags near-duplicate names and ignores archived/forks", () => {
    const r = checkSprawl([
      { name: "CopperNick", archived: false, fork: false },
      { name: "CopperNick2", archived: false, fork: false },
      { name: "Omnidamus", archived: false, fork: false },
      { name: "CopperNick-old", archived: true, fork: false },
    ]);
    expect(r.totalActiveRepos).toBe(3);
    expect(r.nearDuplicates.map((d) => [d.repoA, d.repoB])).toEqual([["CopperNick", "CopperNick2"]]);
    expect(normalizedLevenshtein("abc", "ABC")).toBe(1);
  });

  it("flags counts over the threshold", () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ name: `project-${String.fromCharCode(97 + i)}${i * 7}`, archived: false, fork: false }));
    expect(checkSprawl(many).overThreshold).toBe(true);
  });
});

describe("runAudit + viewer filtering", () => {
  it("audits installation repos, summarizes, and hides repos the viewer cannot access", async () => {
    const repo = (name: string, priv: boolean) => ({
      name, full_name: `acme/${name}`, html_url: `https://github.com/acme/${name}`, private: priv,
      archived: false, fork: false, default_branch: "main", pushed_at: "2026-09-20T00:00:00Z",
    });
    server.use(
      http.get(`${API}/installation/repositories`, () => HttpResponse.json({ total_count: 2, repositories: [repo("web", false), repo("webb", true)] })),
      http.get(`${API}/repos/acme/:r/commits`, () => HttpResponse.json([{ sha: "f".repeat(40), parents: [1], commit: { message: "x" } }])),
      http.get(`${API}/repos/acme/:r/commits/:sha/check-runs`, () => HttpResponse.json({ check_runs: [] })),
      http.get(`${API}/repos/acme/:r/dependabot/alerts`, () => HttpResponse.json([{ state: "open", security_vulnerability: { severity: "critical", package: { name: "p" } } }])),
      http.get(`${API}/repos/acme/:r/pulls`, () => HttpResponse.json([])),
      http.get(`${API}/repos/acme/:r/git/trees/main`, () => HttpResponse.json({ tree: [] })),
    );
    const report = await runAudit(gh(), "acme", undefined, new Date("2026-09-28T00:00:00Z"));
    expect(report.repos).toHaveLength(2);
    const s = summarize(report);
    expect(s).toMatchObject({ reposAudited: 2, dependabotOpen: 2, dependabotCriticalHigh: 2, untestedCommits: 2, nearDuplicates: 1 });

    const visible = filterReportForViewer(report, ["acme/web"]);
    expect(visible.repos.map((r) => r.repo)).toEqual(["acme/web"]);
    expect(visible.sprawl.nearDuplicates).toEqual([]); // pair would reveal private "webb"
    expect(JSON.stringify(visible)).not.toContain("webb");
    expect(filterReportForViewer(report, []).repos).toEqual([]);
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ action: "created" });
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  it("accepts a valid signature and rejects everything else", () => {
    expect(verifySignature(body, sign("s3cret"), "s3cret")).toBe(true);
    expect(verifySignature(body, sign("wrong"), "s3cret")).toBe(false);
    expect(verifySignature(body + " ", sign("s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, sign("s3cret"), undefined)).toBe(false);
  });

  it("ignores whitespace around the configured secret (a pasted value can gain a newline)", () => {
    expect(verifySignature(body, sign("s3cret"), "s3cret\r\n")).toBe(true);
    expect(verifySignature(body, sign("s3cret"), "  s3cret ")).toBe(true);
    expect(verifySignature(body, sign("s3cret"), "   ")).toBe(false);
  });

  it("routes each delivery to the secret that signed it", () => {
    const secrets = { app: "app-secret", marketplace: "mkt-secret" };
    expect(matchWebhookSource(body, sign("app-secret"), "installation", secrets)).toBe("app");
    expect(matchWebhookSource(body, sign("app-secret"), "marketplace_purchase", secrets)).toBe("app");
    expect(matchWebhookSource(body, sign("mkt-secret"), "marketplace_purchase", secrets)).toBe("marketplace");
    expect(matchWebhookSource(body, sign("mkt-secret"), "ping", secrets)).toBe("marketplace");
    expect(matchWebhookSource(body, sign("other"), "ping", secrets)).toBeNull();
  });

  it("never lets the hand-pasted Marketplace secret authorize installation or repo events", () => {
    const secrets = { app: "app-secret", marketplace: "mkt-secret" };
    for (const event of ["installation", "installation_repositories", "push", null]) {
      expect(matchWebhookSource(body, sign("mkt-secret"), event, secrets)).toBeNull();
    }
  });

  it("works with only the App secret configured", () => {
    expect(matchWebhookSource(body, sign("app-secret"), "installation", { app: "app-secret" })).toBe("app");
    expect(matchWebhookSource(body, sign("x"), "marketplace_purchase", { app: "app-secret" })).toBeNull();
  });

  it("diagnoses a rejection without exposing the secret or the signature", () => {
    const secret = "ab".repeat(32);
    const d = diagnoseSignature(body, sign("other"), `${secret}\n`);
    expect(d).toEqual({
      secretConfigured: true,
      secretLength: 64,
      secretFingerprint: secretFingerprint(secret),
      secretHadSurroundingWhitespace: true,
      headerPresent: true,
      headerFormatOk: true,
      bodyBytes: body.length,
    });
    expect(JSON.stringify(d)).not.toContain(secret);
    expect(JSON.stringify(d)).not.toContain(sign("other").slice(7));
    expect(diagnoseSignature(body, null, undefined)).toMatchObject({ secretConfigured: false, headerPresent: false, headerFormatOk: false, secretFingerprint: null });
  });

  it("fingerprints are SHA-256 prefixes of the trimmed secret (matches PowerShell's SHA256 of UTF-8 bytes)", () => {
    // FIPS 180-2 test vector: SHA-256("abc") = ba7816bf 8f01cfea ...
    expect(secretFingerprint("abc")).toBe("ba7816bf");
    expect(secretFingerprint("  abc\n")).toBe("ba7816bf");
    expect(secretFingerprint("")).toBeNull();
    expect(secretFingerprint(undefined)).toBeNull();
  });
});

describe("app JWT", () => {
  it("is RS256 with iss/iat/exp inside GitHub's 10-minute window and verifies with the public key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const now = 1_800_000_000;
    const jwt = appJwt("12345", privateKey.export({ type: "pkcs1", format: "pem" }).toString(), now);
    const [h, p, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims).toEqual({ iss: "12345", iat: now - 60, exp: now + 540 });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${p}`);
    expect(v.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });
});

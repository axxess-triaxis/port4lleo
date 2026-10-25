/**
 * PORT4LLEO command-line interface, bundled into the Claude plugin
 * (claude-plugin/scripts/port4lleo.mjs) by scripts/build-plugin.mjs.
 *
 * It runs the website's own collector, scoring, overrides and governance code,
 * locally, with the user's GitHub token (GITHUB_TOKEN / GH_TOKEN, else `gh auth token`).
 * Nothing is sent anywhere except the GitHub API -- apart from the `remote` commands, which
 * call the PORT4LLEO website with the user's own plugin token (see ./remote.ts).
 *
 *   score <login> [--include-private]
 *   audit <account> [--repos a,b] [--max-repos N]
 *   portfolio validate <file>      portfolio show <login>
 *   activity <account> [--date YYYY-MM-DD]
 *   daily <account>                (activity check, then score + audit if active)
 *   remote portfolio | resync      linked PORT4LLEO account (needs PORT4LLEO_TOKEN)
 *
 * Global: --log-dir <dir> writes <dir>/<date>/<command>-<target>.json and appends one
 * line per run to <dir>/runs.jsonl. --out <file> writes the full JSON result there.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGitHubClient, type GitHubClient } from "@/lib/github/client";
import { collectBuilderMetrics } from "@/lib/github/collect";
import { DEFAULT_LIMITS, listAccountRepos, runAudit, summarize } from "@/lib/governance/audit";
import { applyOverrides, parseOverridesYaml } from "@/lib/overrides/overrides";
import { fetchProfileYaml } from "@/lib/overrides/profileYaml";
import { computeScore } from "@/lib/scoring/score";
import { remoteCall, remoteConfig, remoteHeadline, REMOTE_ACTIONS, type RemoteAction } from "./remote";

export class UsageError extends Error {}

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[a.slice(2)] = next;
        i++;
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  const [command = "help", ...rest] = positional;
  return { command, positional: rest, flags };
}

function flag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function resolveToken(
  env: Record<string, string | undefined> = process.env,
  runGh: () => string = ghToken,
): string {
  const fromEnv = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    const t = runGh().trim();
    if (t) return t;
  } catch {
    /* fall through */
  }
  throw new UsageError("No GitHub token: set GITHUB_TOKEN, or run `gh auth login`.");
}

function ghToken(): string {
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** Local calendar date (YYYY-MM-DD) of `d`, so "today" means the user's today. */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// --- commands -----------------------------------------------------------------

export async function scoreCommand(gh: GitHubClient, login: string, includePrivate: boolean, now = new Date()) {
  const warnings: string[] = [];
  const raw = await collectBuilderMetrics(gh, { login, includePrivate, now });
  const yml = await fetchProfileYaml(gh, login).catch((e) => ({
    overrides: null,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (yml.error) warnings.push(`portfolio.yml ignored: ${yml.error}`);
  const metrics = yml.overrides ? applyOverrides(raw, yml.overrides) : raw;
  const result = computeScore(metrics);
  return {
    login,
    score: result.score,
    tier: result.tier,
    includePrivate,
    categories: result.categories.map((c) => ({ ...c, points: round1(c.points) })),
    metrics: result.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      category: m.category,
      value: m.raw,
      unavailable: m.raw === null,
      points: round1(m.points),
      maxPoints: m.maxPoints,
    })),
    warnings,
    note: "Computed locally from live GitHub data. Dashboard-edited overrides on the PORT4LLEO website are not included.",
  };
}

export async function auditCommand(gh: GitHubClient, account: string, onlyRepos: string[], maxRepos?: number) {
  const limits = { ...DEFAULT_LIMITS, ...(maxRepos ? { maxRepos } : {}) };
  const report = await runAudit(gh, account, limits, new Date(), (g) => listAccountRepos(g, account), onlyRepos);
  return { account, summary: summarize(report), report };
}

export function validatePortfolio(text: string) {
  const parsed = parseOverridesYaml(text);
  if (!parsed.ok) return { valid: false as const, error: parsed.error };
  const v = parsed.value;
  return {
    valid: true as const,
    counts: { hackathons: v.hackathons.length, prototypes: v.prototypes.length, apps: v.apps.length, exclude: v.exclude.length },
    value: v,
  };
}

interface GitHubEvent {
  type: string;
  created_at: string;
  repo: { name: string };
}

/** Whether `account` had any public (or, for the token owner, private) GitHub activity on `date`. */
export async function activityCommand(gh: GitHubClient, account: string, date: string) {
  const me = await gh.rest<{ login: string }>("/user").catch(() => null);
  const path =
    me && me.login.toLowerCase() === account.toLowerCase()
      ? `/users/${encodeURIComponent(account)}/events?per_page=100` // own events include private ones
      : `/users/${encodeURIComponent(account)}/events/public?per_page=100`;
  const events = await gh.restAll<GitHubEvent>(path, 300);
  const onDay = events.filter((e) => localDate(new Date(e.created_at)) === date);
  const byType: Record<string, number> = {};
  for (const e of onDay) byType[e.type] = (byType[e.type] ?? 0) + 1;
  return {
    account,
    date,
    active: onDay.length > 0,
    events: onDay.length,
    byType,
    repos: [...new Set(onDay.map((e) => e.repo.name))].sort(),
  };
}

/** "Alerts off" is never folded into a zero: disabled is a gap, not a clean result. */
export function auditHeadline(account: string, s: ReturnType<typeof summarize>): string {
  const off = s.dependabotDisabled ? `, alerts off on ${s.dependabotDisabled}` : "";
  return (
    `${account}: ${s.reposAudited} repos; Dependabot ${s.dependabotOpen} open ` +
    `(${s.dependabotCriticalHigh} critical/high${off}); ${s.stalePrs} stale PRs; ` +
    `${s.untestedCommits} untested commits; ${s.piiFindings} possible PII` +
    (s.checkErrors ? `; ${s.checkErrors} checks errored` : "")
  );
}

// --- logging ------------------------------------------------------------------

export function writeLog(logDir: string, command: string, target: string, result: unknown, headline: string, now = new Date()) {
  const day = localDate(now);
  const dir = join(logDir, day);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${command}-${target.replace(/[^\w.-]/g, "_")}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  appendFileSync(
    join(logDir, "runs.jsonl"),
    JSON.stringify({ at: now.toISOString(), date: day, command, target, headline, file }) + "\n",
  );
  return file;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// --- entry point --------------------------------------------------------------

const HELP = `port4lleo <command>
  score <login> [--include-private]          Builder Score from live GitHub data
  audit <account> [--repos a,b] [--max-repos N]  Governance audit of an org or user
  portfolio validate <file>                  Check a portfolio.yml
  portfolio show <login>                     Fetch and check <login>/<login>/portfolio.yml
  activity <account> [--date YYYY-MM-DD]     Was there GitHub activity that day?
  daily <account>                            Activity check; if active, score + audit
  remote portfolio | resync                  Linked PORT4LLEO account (PORT4LLEO_TOKEN, PORT4LLEO_URL)
Global: --log-dir <dir>  --out <file>  --full (print full audit report)`;

export async function run(
  argv: string[],
  makeClient = (t: string) => createGitHubClient(t),
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ output: unknown; headline: string; command: string; target: string }> {
  const args = parseArgs(argv);
  const target = args.positional[0];
  const need = (what: string) => {
    if (!target) throw new UsageError(`Missing ${what}.\n\n${HELP}`);
    return target;
  };

  switch (args.command) {
    case "score": {
      const login = need("<login>");
      const out = await scoreCommand(makeClient(resolveToken()), login, args.flags["include-private"] === true);
      return { output: out, headline: `${login}: ${out.score} (${out.tier})`, command: "score", target: login };
    }
    case "audit": {
      const account = need("<account>");
      const repos = (flag(args, "repos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const max = flag(args, "max-repos");
      const out = await auditCommand(makeClient(resolveToken()), account, repos, max ? Number(max) : undefined);
      const s = out.summary;
      return {
        output: out,
        headline: auditHeadline(account, s),
        command: "audit",
        target: account,
      };
    }
    case "portfolio": {
      const sub = args.positional[0];
      const arg = args.positional[1];
      if (sub === "validate" && arg) {
        const out = validatePortfolio(readFileSync(arg, "utf8"));
        return { output: out, headline: out.valid ? "portfolio.yml valid" : `portfolio.yml invalid: ${out.error}`, command: "portfolio-validate", target: arg };
      }
      if (sub === "show" && arg) {
        const yml = await fetchProfileYaml(makeClient(resolveToken()), arg);
        const out = { login: arg, ...yml };
        return { output: out, headline: yml.error ? `invalid: ${yml.error}` : "loaded", command: "portfolio-show", target: arg };
      }
      throw new UsageError(HELP);
    }
    case "activity": {
      const account = need("<account>");
      const out = await activityCommand(makeClient(resolveToken()), account, flag(args, "date") ?? localDate(new Date()));
      return { output: out, headline: `${account} ${out.date}: ${out.active ? `${out.events} events` : "no activity"}`, command: "activity", target: account };
    }
    case "daily": {
      const account = need("<account>");
      const gh = makeClient(resolveToken());
      const activity = await activityCommand(gh, account, flag(args, "date") ?? localDate(new Date()));
      if (!activity.active) {
        return { output: { activity, skipped: "no activity" }, headline: `${account} ${activity.date}: no activity, skipped`, command: "daily", target: account };
      }
      const score = await scoreCommand(gh, account, true);
      const audit = await auditCommand(gh, account, []);
      return {
        output: { activity, score, audit },
        headline: `${activity.date}: ${activity.events} events; score ${score.score} (${score.tier}); ${auditHeadline(account, audit.summary)}`,
        command: "daily",
        target: account,
      };
    }
    case "remote": {
      const action = args.positional[0];
      if (!action || !Object.hasOwn(REMOTE_ACTIONS, action)) throw new UsageError(HELP);
      const out = await remoteCall(action as RemoteAction, remoteConfig(env), fetchImpl);
      return { output: out, headline: remoteHeadline(action as RemoteAction, out), command: `remote-${action}`, target: "account" };
    }
    default:
      throw new UsageError(HELP);
  }
}

/** Full audit reports run to hundreds of KB; the terminal gets the summary, files get everything. */
export function compact(output: unknown, full: boolean): unknown {
  if (full || typeof output !== "object" || output === null) return output;
  const o = output as Record<string, unknown>;
  if ("report" in o) {
    return Object.fromEntries(Object.entries(o).filter(([k]) => k !== "report"));
  }
  if ("audit" in o && typeof o.audit === "object" && o.audit) {
    return { ...o, audit: compact(o.audit, false) };
  }
  return output;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  try {
    const { output, headline, command, target } = await run(argv);
    const logDir = flag(args, "log-dir");
    const out = flag(args, "out");
    if (out) writeFileSync(out, JSON.stringify(output, null, 2));
    const logged = logDir ? writeLog(logDir, command, target, output, headline) : null;
    const shown = compact(output, args.flags.full === true);
    process.stdout.write(JSON.stringify({ headline, ...(logged ? { logged } : {}), result: shown }, null, 2) + "\n");
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  }
}

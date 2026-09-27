import pLimit from "p-limit";
import { lookupIntegration } from "@/lib/classify/integrations";
import { dependencyNames } from "@/lib/classify/manifests";
import {
  classifyApp,
  classifyDeployed,
  classifyHackathon,
  classifyPrototype,
  classifyVercel,
  isTestWorkflow,
  type RepoFacts,
} from "@/lib/classify/repos";
import type { BuilderMetrics, CalendarDay, IntegrationUsage, LanguageUsage, MetricKey, RepoRef } from "@/lib/types";
import type { GitHubClient } from "./client";

export interface CollectOptions {
  login: string;
  includePrivate: boolean;
  /** Max repos pulled via GraphQL (ordered by most recently pushed). */
  maxRepos?: number;
  /** Max repos scanned for per-repo Actions REST calls. */
  maxActionsRepos?: number;
  /** Optional Vercel token; when present, Vercel projects come from the Vercel API. */
  vercelToken?: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}

interface RepoNode {
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  isPrivate: boolean;
  stargazerCount: number;
  primaryLanguage: { name: string; color: string | null } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  deployments: { nodes: { creator: { login: string } | null; latestStatus: { state: string } | null }[] };
  packageJson: { text: string | null } | null;
  requirementsTxt: { text: string | null } | null;
  pyprojectToml: { text: string | null } | null;
}

const PROFILE_QUERY = /* GraphQL */ `
  query Profile($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl
      bio
      url
      createdAt
      pub: repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { totalCount }
      priv: repositories(ownerAffiliations: OWNER, isFork: false, privacy: PRIVATE) { totalCount }
    }
  }
`;

const PROJECTS_QUERY = /* GraphQL */ `
  query Projects($login: String!) {
    user(login: $login) { projectsV2(first: 1) { totalCount } }
  }
`;

const REPOS_QUERY = /* GraphQL */ `
  query Repos($login: String!, $cursor: String, $privacy: RepositoryPrivacy) {
    user(login: $login) {
      repositories(
        first: 50
        after: $cursor
        ownerAffiliations: OWNER
        isFork: false
        privacy: $privacy
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name
          nameWithOwner
          url
          description
          homepageUrl
          isPrivate
          stargazerCount
          primaryLanguage { name color }
          repositoryTopics(first: 20) { nodes { topic { name } } }
          deployments(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes { creator { login } latestStatus { state } }
          }
          packageJson: object(expression: "HEAD:package.json") { ... on Blob { text } }
          requirementsTxt: object(expression: "HEAD:requirements.txt") { ... on Blob { text } }
          pyprojectToml: object(expression: "HEAD:pyproject.toml") { ... on Blob { text } }
        }
      }
    }
  }
`;

function yearRanges(createdAt: string, now: Date): { year: number; from: string; to: string }[] {
  const start = new Date(createdAt).getUTCFullYear();
  const end = now.getUTCFullYear();
  const out = [];
  for (let y = start; y <= end; y++) {
    out.push({
      year: y,
      from: `${y}-01-01T00:00:00Z`,
      to: y === end ? now.toISOString() : `${y}-12-31T23:59:59Z`,
    });
  }
  return out;
}

async function collectContributions(gh: GitHubClient, login: string, createdAt: string, now: Date) {
  const years = yearRanges(createdAt, now);
  const fields = years
    .map(
      (y) =>
        `y${y.year}: contributionsCollection(from: "${y.from}", to: "${y.to}") { contributionCalendar { totalContributions } }`,
    )
    .join("\n");
  const query = `query($login: String!) { user(login: $login) {
    ${fields}
    recent: contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } }
  } }`;
  type Cal = { contributionCalendar: { totalContributions: number } };
  const data = await gh.graphql<{
    user: Record<string, Cal> & {
      recent: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } };
    };
  }>(query, { login });
  const byYear: Record<string, number> = {};
  for (const y of years) byYear[y.year] = data.user[`y${y.year}`]?.contributionCalendar.totalContributions ?? 0;
  const calendar: CalendarDay[] = data.user.recent.contributionCalendar.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  );
  return { byYear, calendar };
}

async function collectMergedPrs(gh: GitHubClient, login: string, createdAt: string, now: Date) {
  const years = yearRanges(createdAt, now);
  const fields = years
    .map((y) => {
      const q = `author:${login} is:pr is:merged merged:${y.from.slice(0, 10)}..${y.to.slice(0, 10)}`;
      return `y${y.year}: search(query: ${JSON.stringify(q)}, type: ISSUE, first: 1) { issueCount }`;
    })
    .join("\n");
  const data = await gh.graphql<Record<string, { issueCount: number }>>(`query { ${fields} }`);
  const byYear: Record<string, number> = {};
  for (const y of years) byYear[y.year] = data[`y${y.year}`]?.issueCount ?? 0;
  return byYear;
}

async function collectRepos(gh: GitHubClient, login: string, includePrivate: boolean, max: number) {
  const nodes: RepoNode[] = [];
  let cursor: string | null = null;
  while (nodes.length < max) {
    const data: {
      user: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: RepoNode[] } };
    } = await gh.graphql(REPOS_QUERY, { login, cursor, privacy: includePrivate ? null : "PUBLIC" });
    nodes.push(...data.user.repositories.nodes);
    if (!data.user.repositories.pageInfo.hasNextPage) break;
    cursor = data.user.repositories.pageInfo.endCursor;
  }
  return nodes.slice(0, max);
}

async function collectActions(gh: GitHubClient, repos: RepoNode[]) {
  const limit = pLimit(5);
  let runs = 0;
  let testRuns = 0;
  let failures = 0;
  await Promise.all(
    repos.map((repo) =>
      limit(async () => {
        try {
          const wf = await gh.rest<{ total_count: number; workflows: { id: number; name: string; path: string }[] }>(
            `/repos/${repo.nameWithOwner}/actions/workflows?per_page=100`,
          );
          if (wf.total_count === 0) return;
          const all = await gh.rest<{ total_count: number }>(`/repos/${repo.nameWithOwner}/actions/runs?per_page=1`);
          runs += all.total_count;
          for (const w of wf.workflows.filter((w) => isTestWorkflow(w.name, w.path))) {
            const ok = await gh.rest<{ total_count: number }>(
              `/repos/${repo.nameWithOwner}/actions/workflows/${w.id}/runs?status=success&per_page=1`,
            );
            testRuns += ok.total_count;
          }
        } catch {
          failures++;
        }
      }),
    ),
  );
  return { runs, testRuns, failures };
}

async function collectVercelApi(token: string, fetchImpl: typeof fetch): Promise<RepoRef[]> {
  const out: RepoRef[] = [];
  let until: number | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://api.vercel.com/v9/projects");
    url.searchParams.set("limit", "100");
    if (until) url.searchParams.set("until", String(until));
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Vercel API ${res.status}`);
    const body = (await res.json()) as {
      projects: { name: string; link?: { type?: string; org?: string; repo?: string } }[];
      pagination?: { next: number | null };
    };
    for (const p of body.projects) {
      if (p.link?.type !== "github" || !p.link.repo) continue;
      const nwo = `${p.link.org}/${p.link.repo}`;
      out.push({
        nameWithOwner: nwo,
        url: `https://github.com/${nwo}`,
        description: `Vercel project "${p.name}"`,
        reason: "vercel-api",
        provenance: "native",
      });
    }
    until = body.pagination?.next ?? null;
    if (!until) break;
  }
  // The Vercel account may link repos owned by orgs; keep them, but de-dupe.
  return [...new Map(out.map((r) => [r.nameWithOwner.toLowerCase(), r])).values()];
}

function toFacts(r: RepoNode): RepoFacts {
  return {
    name: r.name,
    description: r.description,
    topics: r.repositoryTopics.nodes.map((n) => n.topic.name.toLowerCase()),
    homepageUrl: r.homepageUrl || null,
    deps: dependencyNames({
      packageJson: r.packageJson?.text,
      requirementsTxt: r.requirementsTxt?.text,
      pyprojectToml: r.pyprojectToml?.text,
    }),
    deploymentCreators: r.deployments.nodes.map((d) => d.creator?.login ?? "").filter(Boolean),
    deploymentStates: r.deployments.nodes.map((d) => d.latestStatus?.state ?? "").filter(Boolean),
  };
}

/** Private repos are counted but never named: snapshots can be publicly visible. */
function redacted(reason: string, provenance: RepoRef["provenance"] = "inferred"): RepoRef {
  return { nameWithOwner: "Private repository", url: "", description: null, homepageUrl: null, reason, provenance };
}

function ref(r: RepoNode, reason: string): RepoRef {
  if (r.isPrivate) return redacted(reason);
  return {
    nameWithOwner: r.nameWithOwner,
    url: r.url,
    description: r.description,
    homepageUrl: r.homepageUrl || null,
    reason,
    provenance: "inferred",
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Collect every metric for one GitHub user. Each metric group is isolated:
 * if one fails, it is recorded in `errors` and the rest still returns.
 */
export async function collectBuilderMetrics(gh: GitHubClient, opts: CollectOptions): Promise<BuilderMetrics> {
  const now = opts.now ?? new Date();
  const errors: Partial<Record<MetricKey, string>> = {};
  const { login, includePrivate } = opts;

  type ProfileData = {
    user: {
      login: string;
      name: string | null;
      avatarUrl: string;
      bio: string | null;
      url: string;
      createdAt: string;
      pub: { totalCount: number };
      priv: { totalCount: number };
    } | null;
  };
  const profileData = await gh.graphql<ProfileData>(PROFILE_QUERY, { login });
  const user = profileData.user;
  if (!user) throw new Error(`GitHub user "${login}" not found`);

  const [projects, contrib, prs, repos] = await Promise.all([
    gh
      .graphql<{ user: { projectsV2: { totalCount: number } | null } }>(PROJECTS_QUERY, { login })
      .then((d) => d.user.projectsV2?.totalCount ?? null)
      .catch((e) => ((errors.projects = errMsg(e)), null)),
    collectContributions(gh, login, user.createdAt, now).catch((e) => {
      errors.contributions = errMsg(e);
      return { byYear: {}, calendar: [] as CalendarDay[] };
    }),
    collectMergedPrs(gh, login, user.createdAt, now).catch((e) => ((errors.prsMerged = errMsg(e)), {})),
    collectRepos(gh, login, includePrivate, opts.maxRepos ?? 300).catch((e) => {
      const msg = errMsg(e);
      for (const k of ["appsBuilt", "appsDeployed", "hackathons", "prototypes", "integrations"] as const) errors[k] = msg;
      return [] as RepoNode[];
    }),
  ]);
  if (projects === null && !errors.projects) errors.projects = "Projects not visible with the granted scopes";

  const actionsRepos = repos.slice(0, opts.maxActionsRepos ?? 100);
  const actions = await collectActions(gh, actionsRepos);
  if (actionsRepos.length > 0 && actions.failures === actionsRepos.length) {
    errors.actionsRuns = errors.testsPassed = "Actions API unavailable for every scanned repo";
  }

  const appsBuilt: RepoRef[] = [];
  const appsDeployed: RepoRef[] = [];
  let vercelProjects: RepoRef[] = [];
  const hackathons: RepoRef[] = [];
  const prototypes: RepoRef[] = [];
  const integ = new Map<string, IntegrationUsage>();
  const langs = new Map<string, LanguageUsage>();
  let stars = 0;

  for (const r of repos) {
    const f = toFacts(r);
    stars += r.stargazerCount;
    let why: string | null;
    if ((why = classifyApp(f))) appsBuilt.push(ref(r, why));
    if ((why = classifyDeployed(f))) appsDeployed.push(ref(r, why));
    if ((why = classifyVercel(f))) vercelProjects.push(ref(r, why));
    if ((why = classifyHackathon(f))) hackathons.push(ref(r, why));
    if ((why = classifyPrototype(f))) prototypes.push(ref(r, why));

    const seen = new Set<string>();
    for (const dep of f.deps) {
      const def = lookupIntegration(dep);
      if (!def || seen.has(def.name)) continue;
      seen.add(def.name);
      const cur = integ.get(def.name) ?? { ...def, repos: 0 };
      cur.repos++;
      integ.set(def.name, cur);
    }
    if (r.primaryLanguage) {
      const cur = langs.get(r.primaryLanguage.name) ?? { ...r.primaryLanguage, repos: 0 };
      cur.repos++;
      langs.set(r.primaryLanguage.name, cur);
    }
  }

  let vercelSource: BuilderMetrics["vercelSource"] = "github-deployments";
  if (opts.vercelToken) {
    try {
      const publicRepos = new Set(repos.filter((r) => !r.isPrivate).map((r) => r.nameWithOwner.toLowerCase()));
      // Only name Vercel-linked repos we have confirmed are public.
      vercelProjects = (await collectVercelApi(opts.vercelToken, opts.fetchImpl ?? fetch)).map((v) =>
        publicRepos.has(v.nameWithOwner.toLowerCase()) ? v : redacted(v.reason, v.provenance),
      );
      vercelSource = "vercel-api";
    } catch (e) {
      errors.vercelProjects = `${errMsg(e)} (fell back to GitHub deployment signals)`;
    }
  }

  const byCount = <T extends { repos: number; name: string }>(a: T, b: T) => b.repos - a.repos || a.name.localeCompare(b.name);

  return {
    schemaVersion: 1,
    collectedAt: now.toISOString(),
    profile: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      url: user.url,
      createdAt: user.createdAt,
    },
    repos: {
      total: user.pub.totalCount + (includePrivate ? user.priv.totalCount : 0),
      public: user.pub.totalCount,
      private: includePrivate ? user.priv.totalCount : 0,
      stars,
    },
    projects,
    prsMergedByYear: prs,
    contributionsByYear: contrib.byYear,
    calendar: contrib.calendar,
    actionsRuns: errors.actionsRuns ? null : actions.runs,
    testsPassed: errors.testsPassed ? null : actions.testRuns,
    actionsReposScanned: actionsRepos.length,
    appsBuilt,
    appsDeployed,
    vercelProjects,
    vercelSource,
    hackathons,
    prototypes,
    integrations: [...integ.values()].sort(byCount),
    languages: [...langs.values()].sort(byCount),
    includesPrivate: includePrivate,
    errors,
  };
}

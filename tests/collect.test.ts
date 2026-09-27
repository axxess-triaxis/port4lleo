import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGitHubClient } from "@/lib/github/client";
import { collectBuilderMetrics } from "@/lib/github/collect";

const repoNode = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  nameWithOwner: `octo/${name}`,
  url: `https://github.com/octo/${name}`,
  description: null,
  homepageUrl: null,
  isPrivate: false,
  stargazerCount: 2,
  primaryLanguage: { name: "TypeScript", color: "#3178c6" },
  repositoryTopics: { nodes: [] },
  deployments: { nodes: [] },
  packageJson: null,
  requirementsTxt: null,
  pyprojectToml: null,
  ...extra,
});

const REPOS = [
  repoNode("shop", {
    homepageUrl: "https://shop.example",
    packageJson: { text: JSON.stringify({ dependencies: { next: "16", stripe: "1", "@supabase/supabase-js": "2" } }) },
    deployments: { nodes: [{ creator: { login: "vercel" }, latestStatus: { state: "SUCCESS" } }] },
  }),
  repoNode("zk-hack", { repositoryTopics: { nodes: [{ topic: { name: "ETHGlobal" } }] } }),
  repoNode("agent-poc", {
    requirementsTxt: { text: "openai\nfastapi\n" },
    primaryLanguage: { name: "Python", color: "#3572A5" },
  }),
];

let actionsFail = false;
let projectsError = false;

const server = setupServer(
  http.post("https://api.github.com/graphql", async ({ request }) => {
    const { query } = (await request.json()) as { query: string };
    if (query.includes("query Profile")) {
      return HttpResponse.json({
        data: {
          user: {
            login: "octo",
            name: "Octo",
            avatarUrl: "https://a/x.png",
            bio: null,
            url: "https://github.com/octo",
            createdAt: "2025-02-01T00:00:00Z",
            pub: { totalCount: 3 },
            priv: { totalCount: 4 },
          },
        },
      });
    }
    if (query.includes("query Projects")) {
      return projectsError
        ? HttpResponse.json({ data: { user: { projectsV2: null } }, errors: [{ message: "scope" }] })
        : HttpResponse.json({ data: { user: { projectsV2: { totalCount: 2 } } } });
    }
    if (query.includes("query Repos")) {
      return HttpResponse.json({
        data: { user: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: REPOS } } },
      });
    }
    if (query.includes("contributionsCollection")) {
      return HttpResponse.json({
        data: {
          user: {
            y2025: { contributionCalendar: { totalContributions: 300 } },
            y2026: { contributionCalendar: { totalContributions: 120 } },
            recent: {
              contributionCalendar: {
                weeks: [{ contributionDays: [{ date: "2026-09-01", contributionCount: 3 }] }],
              },
            },
          },
        },
      });
    }
    if (query.includes("is:merged")) {
      return HttpResponse.json({ data: { y2025: { issueCount: 10 }, y2026: { issueCount: 5 } } });
    }
    return HttpResponse.json({ errors: [{ message: "unexpected query" }] });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/actions/workflows", ({ params }) => {
    if (actionsFail) return new HttpResponse(null, { status: 403 });
    if (params.repo !== "shop") return HttpResponse.json({ total_count: 0, workflows: [] });
    return HttpResponse.json({
      total_count: 2,
      workflows: [
        { id: 1, name: "CI", path: ".github/workflows/ci.yml" },
        { id: 2, name: "Deploy", path: ".github/workflows/deploy.yml" },
      ],
    });
  }),
  http.get("https://api.github.com/repos/:owner/:repo/actions/runs", () => HttpResponse.json({ total_count: 40 })),
  http.get("https://api.github.com/repos/:owner/:repo/actions/workflows/:id/runs", ({ params }) =>
    HttpResponse.json({ total_count: params.id === "1" ? 25 : 999 }),
  ),
  http.get("https://api.vercel.com/v9/projects", () =>
    HttpResponse.json({
      projects: [
        { name: "shop", link: { type: "github", org: "octo", repo: "shop" } },
        { name: "landing", link: { type: "github", org: "octo", repo: "landing" } },
        { name: "manual", link: undefined },
      ],
      pagination: { next: null },
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  actionsFail = false;
  projectsError = false;
});
afterAll(() => server.close());

const NOW = new Date("2026-09-27T00:00:00Z");
const gh = () => createGitHubClient("test-token");

describe("collectBuilderMetrics", () => {
  it("collects and classifies every metric", async () => {
    const m = await collectBuilderMetrics(gh(), { login: "octo", includePrivate: false, now: NOW });
    expect(m.repos).toEqual({ total: 3, public: 3, private: 0, stars: 6 });
    expect(m.projects).toBe(2);
    expect(m.contributionsByYear).toEqual({ 2025: 300, 2026: 120 });
    expect(m.prsMergedByYear).toEqual({ 2025: 10, 2026: 5 });
    expect(m.calendar).toEqual([{ date: "2026-09-01", count: 3 }]);
    expect(m.actionsRuns).toBe(40);
    expect(m.testsPassed).toBe(25); // only the CI workflow, not Deploy
    expect(m.appsBuilt.map((r) => r.nameWithOwner)).toEqual(["octo/shop"]);
    expect(m.appsDeployed.map((r) => r.reason)).toEqual(["github-deployment"]);
    expect(m.vercelProjects.map((r) => r.nameWithOwner)).toEqual(["octo/shop"]);
    expect(m.vercelSource).toBe("github-deployments");
    expect(m.hackathons.map((r) => r.nameWithOwner)).toEqual(["octo/zk-hack"]);
    expect(m.prototypes.map((r) => r.nameWithOwner)).toEqual(["octo/agent-poc"]);
    expect(m.integrations.map((i) => i.name).sort()).toEqual(["OpenAI", "Stripe", "Supabase"]);
    expect(m.languages[0]).toMatchObject({ name: "TypeScript", repos: 2 });
    expect(m.errors).toEqual({});
  });

  it("includes private repo counts only when opted in", async () => {
    const m = await collectBuilderMetrics(gh(), { login: "octo", includePrivate: true, now: NOW });
    expect(m.repos.total).toBe(7);
    expect(m.includesPrivate).toBe(true);
  });

  it("degrades per metric instead of failing the sync", async () => {
    actionsFail = true;
    projectsError = true;
    const m = await collectBuilderMetrics(gh(), { login: "octo", includePrivate: false, now: NOW });
    expect(m.actionsRuns).toBeNull();
    expect(m.testsPassed).toBeNull();
    expect(m.projects).toBeNull();
    expect(Object.keys(m.errors).sort()).toEqual(["actionsRuns", "projects", "testsPassed"]);
    expect(m.appsBuilt).toHaveLength(1); // unaffected
  });

  it("uses the Vercel API when a token is supplied", async () => {
    const m = await collectBuilderMetrics(gh(), { login: "octo", includePrivate: false, now: NOW, vercelToken: "v" });
    expect(m.vercelSource).toBe("vercel-api");
    // octo/landing is not a confirmed-public repo, so it is counted but not named.
    expect(m.vercelProjects.map((r) => r.nameWithOwner)).toEqual(["octo/shop", "Private repository"]);
  });

  it("never exposes private repo names or descriptions", async () => {
    server.use(
      http.post("https://api.github.com/graphql", async ({ request }) => {
        const { query } = (await request.clone().json()) as { query: string };
        if (!query.includes("query Repos")) return undefined; // fall through to the default handler
        const secret = repoNode("secret-hack", {
          isPrivate: true,
          description: "confidential",
          repositoryTopics: { nodes: [{ topic: { name: "hackathon" } }] },
        });
        return HttpResponse.json({
          data: { user: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [secret] } } },
        });
      }),
    );
    const m = await collectBuilderMetrics(gh(), { login: "octo", includePrivate: true, now: NOW });
    expect(m.hackathons).toHaveLength(1);
    expect(JSON.stringify(m)).not.toMatch(/secret-hack|confidential/);
  });

  it("throws when the user does not exist", async () => {
    server.use(http.post("https://api.github.com/graphql", () => HttpResponse.json({ data: { user: null } })));
    await expect(collectBuilderMetrics(gh(), { login: "ghost", includePrivate: false, now: NOW })).rejects.toThrow(
      /not found/,
    );
  });
});

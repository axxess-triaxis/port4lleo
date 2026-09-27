import type { BuilderMetrics, CalendarDay, RepoRef } from "@/lib/types";

/**
 * Fictional builder used by /u/demo and the e2e tests. Clearly labelled as demo
 * data in the UI -- it describes no real person.
 */
function calendar(end: Date): CalendarDay[] {
  const days: CalendarDay[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const r = rand();
    const count = r < (weekend ? 0.55 : 0.2) ? 0 : Math.floor(r * (weekend ? 6 : 14));
    days.push({ date: d.toISOString().slice(0, 10), count });
  }
  return days;
}

const repo = (name: string, reason: string, extra: Partial<RepoRef> = {}): RepoRef => ({
  nameWithOwner: `demo-builder/${name}`,
  url: `https://github.com/demo-builder/${name}`,
  description: null,
  homepageUrl: null,
  reason,
  provenance: "inferred",
  ...extra,
});

export const DEMO_LOGIN = "demo";

export function demoMetrics(now = new Date("2026-09-27T00:00:00Z")): BuilderMetrics {
  return {
    schemaVersion: 1,
    collectedAt: now.toISOString(),
    profile: {
      login: "demo",
      name: "Demo Builder",
      avatarUrl: "https://github.com/identicons/demo-builder.png",
      bio: "Sample portfolio -- sign in with GitHub to generate yours.",
      url: "https://github.com",
      createdAt: "2021-03-15T00:00:00Z",
    },
    repos: { total: 64, public: 51, private: 13, stars: 412 },
    projects: 6,
    prsMergedByYear: { 2021: 12, 2022: 38, 2023: 71, 2024: 96, 2025: 140, 2026: 118 },
    contributionsByYear: { 2021: 210, 2022: 640, 2023: 1180, 2024: 1520, 2025: 2210, 2026: 1830 },
    calendar: calendar(now),
    actionsRuns: 3874,
    testsPassed: 1612,
    actionsReposScanned: 64,
    appsBuilt: [
      repo("invoice-ai", "framework:next", { description: "AI invoice parsing SaaS", homepageUrl: "https://example.com" }),
      repo("fit-track", "framework:expo", { description: "Habit tracker mobile app" }),
      repo("menu-qr", "topic:webapp", { description: "QR menus for restaurants" }),
      repo("devlog", "framework:astro"),
      repo("pay-split", "framework:vite"),
      repo("ops-bot", "framework:fastapi"),
      repo("docs-chat", "framework:next"),
      repo("kiosk", "framework:electron"),
      repo("event-radar", "framework:sveltekit"),
    ],
    appsDeployed: [
      repo("invoice-ai", "github-deployment"),
      repo("menu-qr", "github-deployment"),
      repo("devlog", "homepage"),
      repo("pay-split", "github-deployment"),
      repo("docs-chat", "github-deployment"),
      repo("event-radar", "homepage"),
    ],
    vercelProjects: [repo("invoice-ai", "vercel-deployment"), repo("pay-split", "vercel-deployment"), repo("docs-chat", "vercel-deployment"), repo("devlog", "vercel-deployment")],
    vercelSource: "github-deployments",
    hackathons: [
      repo("ethglobal-zk-vote", "topic:ethglobal", { description: "ZK voting, ETHGlobal" }),
      repo("health-hack-24", "topic:hackathon"),
      repo("climate-hack", "name/description"),
      {
        nameWithOwner: "Smart India Hackathon 2025",
        url: "",
        description: "Finalist",
        reason: "self-declared",
        provenance: "self-declared",
      },
    ],
    prototypes: [repo("voice-agent-poc", "topic:poc"), repo("rag-mvp", "topic:mvp"), repo("vla-experiment", "topic:experiment")],
    integrations: [
      { name: "OpenAI", category: "AI", repos: 14 },
      { name: "Supabase", category: "Backend", repos: 11 },
      { name: "Stripe", category: "Payments", repos: 7 },
      { name: "Anthropic", category: "AI", repos: 6 },
      { name: "AWS", category: "Cloud", repos: 5 },
      { name: "Vercel AI SDK", category: "AI", repos: 5 },
      { name: "Prisma", category: "Database", repos: 4 },
      { name: "Sentry", category: "Observability", repos: 3 },
      { name: "Twilio", category: "Communication", repos: 2 },
      { name: "Clerk", category: "Auth", repos: 2 },
    ],
    languages: [
      { name: "TypeScript", color: "#3178c6", repos: 31 },
      { name: "Python", color: "#3572A5", repos: 18 },
      { name: "Go", color: "#00ADD8", repos: 4 },
      { name: "Rust", color: "#dea584", repos: 2 },
    ],
    includesPrivate: true,
    errors: {},
  };
}

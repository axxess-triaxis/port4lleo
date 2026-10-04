import { sumValues } from "@/lib/scoring/score";
import type { BuilderMetrics, MetricKey, Provenance } from "@/lib/types";

export interface StatTile {
  key: MetricKey;
  label: string;
  value: number | null;
  provenance: Provenance | "mixed";
  hint: string;
  error?: string;
}

function listProvenance(list: { provenance: Provenance }[]): StatTile["provenance"] {
  const kinds = new Set(list.map((r) => r.provenance));
  if (kinds.size > 1) return "mixed";
  return kinds.values().next().value ?? "inferred";
}

/** The 12 metric tiles, in display order, each with its provenance and a one-line source hint. */
export function statTiles(m: BuilderMetrics): StatTile[] {
  const e = m.errors;
  return [
    { key: "repos", label: "Repositories", value: m.repos.total, provenance: "native", hint: `${m.repos.public} public${m.includesPrivate ? `, ${m.repos.private} private` : ""}, excl. forks` },
    { key: "projects", label: "Projects", value: m.projects, provenance: "native", hint: "GitHub Projects boards", error: e.projects },
    { key: "prsMerged", label: "PRs merged", value: sumValues(m.prsMergedByYear), provenance: "native", hint: "Authored, all repos", error: e.prsMerged },
    { key: "contributions", label: "Contributions", value: sumValues(m.contributionsByYear), provenance: "native", hint: "All-time contribution graph", error: e.contributions },
    { key: "actionsRuns", label: "Actions runs", value: m.actionsRuns, provenance: "native", hint: `Across ${m.actionsReposScanned} most recent repos`, error: e.actionsRuns },
    { key: "testsPassed", label: "Test runs passed", value: m.testsPassed, provenance: "inferred", hint: "Successful runs of test/CI workflows", error: e.testsPassed },
    { key: "appsBuilt", label: "Apps built", value: m.appsBuilt.length, provenance: listProvenance(m.appsBuilt), hint: "App framework + shipped, or app topic", error: e.appsBuilt },
    { key: "appsDeployed", label: "Apps deployed", value: m.appsDeployed.length, provenance: "inferred", hint: "Successful deployment or live homepage", error: e.appsDeployed },
    { key: "vercelProjects", label: "Vercel projects", value: m.vercelProjects.length, provenance: m.vercelSource === "vercel-api" ? "native" : "inferred", hint: m.vercelSource === "vercel-api" ? "From the Vercel API" : "Repos deployed by Vercel", error: e.vercelProjects },
    { key: "hackathons", label: "Hackathons", value: m.hackathons.length, provenance: listProvenance(m.hackathons), hint: "Topics, names, or self-declared", error: e.hackathons },
    { key: "prototypes", label: "Prototypes", value: m.prototypes.length, provenance: listProvenance(m.prototypes), hint: "poc / mvp repos + every hackathon entry", error: e.prototypes },
    { key: "integrations", label: "Integrations", value: m.integrations.length, provenance: "inferred", hint: "Distinct services in manifests", error: e.integrations },
  ];
}

export function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return n.toLocaleString("en-US");
}

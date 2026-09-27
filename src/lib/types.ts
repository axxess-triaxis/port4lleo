/**
 * Core data model. `BuilderMetrics` is what a sync produces and what a
 * snapshot stores; everything the UI and the score need derives from it.
 */

/** How a number was obtained. Shown next to every metric in the UI. */
export type Provenance = "native" | "inferred" | "self-declared";

export interface RepoRef {
  nameWithOwner: string;
  url: string;
  description?: string | null;
  homepageUrl?: string | null;
  /** Why this repo landed in the list (e.g. "topic:hackathon", "framework:next"). */
  reason: string;
  provenance: Provenance;
}

export interface IntegrationUsage {
  name: string;
  category: string;
  repos: number;
}

export interface LanguageUsage {
  name: string;
  color: string | null;
  repos: number;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export type MetricKey =
  | "repos"
  | "projects"
  | "prsMerged"
  | "contributions"
  | "actionsRuns"
  | "testsPassed"
  | "appsBuilt"
  | "appsDeployed"
  | "vercelProjects"
  | "hackathons"
  | "prototypes"
  | "integrations";

export interface BuilderMetrics {
  schemaVersion: 1;
  collectedAt: string; // ISO
  profile: {
    login: string;
    name: string | null;
    avatarUrl: string;
    bio: string | null;
    url: string;
    createdAt: string;
  };
  repos: { total: number; public: number; private: number; stars: number };
  projects: number | null;
  prsMergedByYear: Record<string, number>;
  contributionsByYear: Record<string, number>;
  /** Last ~365 days, for the heatmap. */
  calendar: CalendarDay[];
  actionsRuns: number | null;
  testsPassed: number | null;
  /** How many repos the per-repo Actions scan covered (it is capped). */
  actionsReposScanned: number;
  appsBuilt: RepoRef[];
  appsDeployed: RepoRef[];
  vercelProjects: RepoRef[];
  vercelSource: "github-deployments" | "vercel-api";
  hackathons: RepoRef[];
  prototypes: RepoRef[];
  integrations: IntegrationUsage[];
  languages: LanguageUsage[];
  includesPrivate: boolean;
  /** Per-metric failures. A failed metric degrades to null/empty, the sync still succeeds. */
  errors: Partial<Record<MetricKey, string>>;
}

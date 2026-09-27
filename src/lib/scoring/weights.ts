import type { MetricKey } from "@/lib/types";

/**
 * Builder Score configuration. Fork-friendly: change these and SCORING.md,
 * the tests assert weights still sum to 100.
 *
 * `cap` is the value at which a metric saturates (normalised score = 1).
 * Normalisation is logarithmic, so the first few units matter most.
 */
export interface MetricWeight {
  key: MetricKey;
  label: string;
  category: Category;
  weight: number;
  cap: number;
}

export type Category = "Shipping" | "Collaboration" | "Engineering rigor" | "Breadth" | "Hackathons";

export const WEIGHTS: MetricWeight[] = [
  { key: "appsDeployed", label: "Apps deployed", category: "Shipping", weight: 15, cap: 30 },
  { key: "appsBuilt", label: "Apps built", category: "Shipping", weight: 10, cap: 40 },
  { key: "vercelProjects", label: "Vercel projects", category: "Shipping", weight: 5, cap: 30 },
  { key: "prototypes", label: "Prototypes", category: "Shipping", weight: 5, cap: 30 },
  { key: "prsMerged", label: "PRs merged", category: "Collaboration", weight: 15, cap: 500 },
  { key: "contributions", label: "Contributions", category: "Collaboration", weight: 10, cap: 5000 },
  { key: "testsPassed", label: "Test runs passed", category: "Engineering rigor", weight: 12, cap: 2000 },
  { key: "actionsRuns", label: "Actions runs", category: "Engineering rigor", weight: 8, cap: 5000 },
  { key: "repos", label: "Repositories", category: "Breadth", weight: 4, cap: 150 },
  { key: "projects", label: "Projects", category: "Breadth", weight: 3, cap: 20 },
  { key: "integrations", label: "Integrations", category: "Breadth", weight: 5, cap: 25 },
  { key: "hackathons", label: "Hackathons", category: "Hackathons", weight: 8, cap: 15 },
];

export const CATEGORIES: Category[] = ["Shipping", "Collaboration", "Engineering rigor", "Breadth", "Hackathons"];

/** Half-life, in years, applied to year-bucketed activity (contributions, merged PRs). */
export const ACTIVITY_HALF_LIFE_YEARS = 1;

/** Self-declared entries count at this fraction of an inferred/native one. */
export const SELF_DECLARED_FACTOR = 0.5;

export const MAX_SCORE = 1000;

export const TIERS: { min: number; name: string }[] = [
  { min: 800, name: "Legend" },
  { min: 600, name: "Architect" },
  { min: 400, name: "Shipper" },
  { min: 200, name: "Builder" },
  { min: 0, name: "Explorer" },
];

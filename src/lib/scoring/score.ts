import type { BuilderMetrics, MetricKey, RepoRef } from "@/lib/types";
import {
  ACTIVITY_HALF_LIFE_YEARS,
  CATEGORIES,
  MAX_SCORE,
  SELF_DECLARED_FACTOR,
  TIERS,
  WEIGHTS,
  type Category,
} from "./weights";

export interface MetricScore {
  key: MetricKey;
  label: string;
  category: Category;
  /** Raw value shown to the user (all-time, not decayed). */
  raw: number | null;
  /** Value actually fed into the score (decayed / self-declared discounted). */
  effective: number;
  normalized: number; // 0..1
  points: number; // contribution to the 0..1000 score
  maxPoints: number;
}

export interface ScoreResult {
  score: number;
  tier: string;
  metrics: MetricScore[];
  categories: { category: Category; points: number; maxPoints: number }[];
}

/** log-normalise into 0..1, saturating at `cap`. */
export function normalize(value: number, cap: number): number {
  if (!(value > 0)) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(cap));
}

/** Sum year buckets with exponential decay by age (current year = weight 1). */
export function decayedSum(byYear: Record<string, number>, now: Date, halfLife = ACTIVITY_HALF_LIFE_YEARS): number {
  const current = now.getUTCFullYear();
  let total = 0;
  for (const [year, count] of Object.entries(byYear)) {
    const age = Math.max(0, current - Number(year));
    total += count * Math.pow(0.5, age / halfLife);
  }
  return total;
}

export function sumValues(byYear: Record<string, number>): number {
  return Object.values(byYear).reduce((a, b) => a + b, 0);
}

function listValue(list: RepoRef[]): { raw: number; effective: number } {
  let effective = 0;
  for (const r of list) effective += r.provenance === "self-declared" ? SELF_DECLARED_FACTOR : 1;
  return { raw: list.length, effective };
}

function values(m: BuilderMetrics, now: Date): Record<MetricKey, { raw: number | null; effective: number }> {
  const scalar = (v: number | null) => ({ raw: v, effective: v ?? 0 });
  return {
    repos: scalar(m.repos.total),
    projects: scalar(m.projects),
    prsMerged: { raw: sumValues(m.prsMergedByYear), effective: decayedSum(m.prsMergedByYear, now) },
    contributions: { raw: sumValues(m.contributionsByYear), effective: decayedSum(m.contributionsByYear, now) },
    actionsRuns: scalar(m.actionsRuns),
    testsPassed: scalar(m.testsPassed),
    appsBuilt: listValue(m.appsBuilt),
    appsDeployed: listValue(m.appsDeployed),
    vercelProjects: listValue(m.vercelProjects),
    hackathons: listValue(m.hackathons),
    prototypes: listValue(m.prototypes),
    integrations: scalar(m.integrations.length),
  };
}

export function tierFor(score: number): string {
  return TIERS.find((t) => score >= t.min)?.name ?? "Explorer";
}

/**
 * Pure scoring function. Pass metrics *after* overrides are applied.
 * `now` defaults to the collection time so a stored snapshot always re-scores identically.
 */
export function computeScore(m: BuilderMetrics, now: Date = new Date(m.collectedAt)): ScoreResult {
  const vals = values(m, now);
  const unit = MAX_SCORE / 100; // weights sum to 100
  const metrics: MetricScore[] = WEIGHTS.map((w) => {
    const v = vals[w.key];
    const normalized = normalize(v.effective, w.cap);
    return {
      key: w.key,
      label: w.label,
      category: w.category,
      raw: v.raw,
      effective: v.effective,
      normalized,
      points: normalized * w.weight * unit,
      maxPoints: w.weight * unit,
    };
  });
  const categories = CATEGORIES.map((category) => {
    const ms = metrics.filter((x) => x.category === category);
    return {
      category,
      points: ms.reduce((a, x) => a + x.points, 0),
      maxPoints: ms.reduce((a, x) => a + x.maxPoints, 0),
    };
  });
  const score = Math.round(metrics.reduce((a, x) => a + x.points, 0));
  return { score, tier: tierFor(score), metrics, categories };
}

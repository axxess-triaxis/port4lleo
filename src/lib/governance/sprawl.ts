/** Repo sprawl, ported from RepoWatch checks/repo_sprawl.py (same thresholds). */
import type { NearDuplicate, SprawlResult } from "./types";

export const DEFAULT_COUNT_THRESHOLD = 15;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.75;

export function normalizedLevenshtein(x: string, y: string): number {
  const a = x.toLowerCase();
  const b = y.toLowerCase();
  if (a === b) return 1;
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...new Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Pure: operates on the installation's repo list (already fetched by the audit). */
export function checkSprawl(
  repos: { name: string; archived: boolean; fork: boolean }[],
  countThreshold = DEFAULT_COUNT_THRESHOLD,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
): SprawlResult {
  const active = repos.filter((r) => !r.archived && !r.fork).map((r) => r.name);
  const nearDuplicates: NearDuplicate[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const sim = normalizedLevenshtein(active[i], active[j]);
      if (sim >= similarityThreshold) {
        nearDuplicates.push({ repoA: active[i], repoB: active[j], similarity: Math.round(sim * 100) / 100 });
      }
    }
  }
  return { totalActiveRepos: active.length, overThreshold: active.length > countThreshold, nearDuplicates, error: null };
}

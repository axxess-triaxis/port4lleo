import { describe, expect, it } from "vitest";
import { demoMetrics } from "@/lib/demo";
import { computeScore, decayedSum, normalize, tierFor } from "@/lib/scoring/score";
import { MAX_SCORE, WEIGHTS } from "@/lib/scoring/weights";
import type { BuilderMetrics } from "@/lib/types";

function empty(): BuilderMetrics {
  const m = demoMetrics();
  return {
    ...m,
    repos: { total: 0, public: 0, private: 0, stars: 0 },
    projects: 0,
    prsMergedByYear: {},
    contributionsByYear: {},
    actionsRuns: 0,
    testsPassed: 0,
    appsBuilt: [],
    appsDeployed: [],
    vercelProjects: [],
    hackathons: [],
    prototypes: [],
    integrations: [],
  };
}

describe("weights", () => {
  it("sum to 100 and have unique keys", () => {
    expect(WEIGHTS.reduce((a, w) => a + w.weight, 0)).toBe(100);
    expect(new Set(WEIGHTS.map((w) => w.key)).size).toBe(WEIGHTS.length);
  });
});

describe("normalize", () => {
  it("is 0 at 0, 1 at cap, clamps above cap", () => {
    expect(normalize(0, 10)).toBe(0);
    expect(normalize(10, 10)).toBeCloseTo(1);
    expect(normalize(10_000, 10)).toBe(1);
    expect(normalize(Number.NaN, 10)).toBe(0);
  });
  it("is monotonic and concave (diminishing returns)", () => {
    const a = normalize(1, 100), b = normalize(2, 100), c = normalize(3, 100);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeGreaterThan(c - b);
  });
});

describe("decayedSum", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("halves per year of age", () => {
    expect(decayedSum({ 2026: 100 }, now)).toBe(100);
    expect(decayedSum({ 2025: 100 }, now)).toBe(50);
    expect(decayedSum({ 2024: 100 }, now)).toBe(25);
  });
  it("makes recent activity worth more than old activity", () => {
    expect(decayedSum({ 2026: 10 }, now)).toBeGreaterThan(decayedSum({ 2020: 10 }, now));
  });
});

describe("computeScore", () => {
  it("scores an empty profile as 0 / Explorer", () => {
    const r = computeScore(empty());
    expect(r.score).toBe(0);
    expect(r.tier).toBe("Explorer");
  });

  it("maxes out at MAX_SCORE when every metric is at cap", () => {
    const m = empty();
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ nameWithOwner: `x/${i}`, url: "", reason: "t", provenance: "inferred" as const }));
    Object.assign(m, {
      repos: { total: 1e6, public: 1e6, private: 0, stars: 0 },
      projects: 1e6,
      prsMergedByYear: { [new Date(m.collectedAt).getUTCFullYear()]: 1e6 },
      contributionsByYear: { [new Date(m.collectedAt).getUTCFullYear()]: 1e6 },
      actionsRuns: 1e6,
      testsPassed: 1e6,
      appsBuilt: many(100),
      appsDeployed: many(100),
      vercelProjects: many(100),
      hackathons: many(100),
      prototypes: many(100),
      integrations: many(100).map((r) => ({ name: r.nameWithOwner, category: "x", repos: 1 })),
    });
    expect(computeScore(m).score).toBe(MAX_SCORE);
  });

  it("increases when any single metric increases", () => {
    const base = computeScore(empty()).score;
    const m = empty();
    m.testsPassed = 50;
    expect(computeScore(m).score).toBeGreaterThan(base);
  });

  it("counts self-declared entries at half weight", () => {
    const inferred = empty();
    inferred.hackathons = [{ nameWithOwner: "a/b", url: "", reason: "topic", provenance: "inferred" }];
    const declared = empty();
    declared.hackathons = [{ nameWithOwner: "X", url: "", reason: "self-declared", provenance: "self-declared" }];
    const hi = computeScore(inferred).metrics.find((x) => x.key === "hackathons")!;
    const lo = computeScore(declared).metrics.find((x) => x.key === "hackathons")!;
    expect(hi.effective).toBe(1);
    expect(lo.effective).toBe(0.5);
    expect(hi.points).toBeGreaterThan(lo.points);
  });

  it("treats unavailable (null) metrics as zero without throwing", () => {
    const m = empty();
    m.projects = null;
    m.actionsRuns = null;
    expect(() => computeScore(m)).not.toThrow();
  });

  it("category totals add up to the score", () => {
    const r = computeScore(demoMetrics());
    const sum = r.categories.reduce((a, c) => a + c.points, 0);
    expect(Math.round(sum)).toBe(r.score);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it("is deterministic for a stored snapshot", () => {
    expect(computeScore(demoMetrics()).score).toBe(computeScore(demoMetrics()).score);
  });
});

describe("tierFor", () => {
  it("maps boundaries", () => {
    expect(tierFor(0)).toBe("Explorer");
    expect(tierFor(199)).toBe("Explorer");
    expect(tierFor(200)).toBe("Builder");
    expect(tierFor(400)).toBe("Shipper");
    expect(tierFor(600)).toBe("Architect");
    expect(tierFor(800)).toBe("Legend");
  });
});

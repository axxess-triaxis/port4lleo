import "server-only";
import { demoMetrics, DEMO_LOGIN } from "@/lib/demo";
import { applyOverrides, EMPTY_OVERRIDES, overridesSchema, type Overrides } from "@/lib/overrides/overrides";
import { computeScore, type ScoreResult } from "@/lib/scoring/score";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { BuilderMetrics } from "@/lib/types";

export interface Portfolio {
  metrics: BuilderMetrics;
  score: ScoreResult;
  overrides: Overrides;
  history: { at: string; score: number }[];
  isDemo: boolean;
  isPublic: boolean;
}

export function buildPortfolio(
  raw: BuilderMetrics,
  overrides: Overrides,
  history: Portfolio["history"],
  flags: { isDemo: boolean; isPublic: boolean },
): Portfolio {
  const metrics = applyOverrides(raw, overrides);
  return { metrics, score: computeScore(metrics), overrides, history, ...flags };
}

export function demoPortfolio(): Portfolio {
  const p = buildPortfolio(demoMetrics(), EMPTY_OVERRIDES, [], { isDemo: true, isPublic: true });
  // Illustrative monthly history ending at the demo's actual current score.
  const steps = [0.58, 0.64, 0.71, 0.79, 0.86, 0.94, 1];
  p.history = steps.map((f, i) => ({ at: new Date(Date.UTC(2026, 2 + i, 27)).toISOString(), score: Math.round(p.score.score * f) }));
  return p;
}

/** Loads a portfolio by login via the RLS-bound client: returns null when missing or private (for non-owners). */
export async function getPortfolioByLogin(login: string): Promise<Portfolio | null> {
  if (login.toLowerCase() === DEMO_LOGIN) return demoPortfolio();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_public")
    .ilike("login", login.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle();
  if (!profile) return null;
  return getPortfolioByUserId(profile.id, profile.is_public);
}

export async function getPortfolioByUserId(userId: string, isPublic: boolean): Promise<Portfolio | null> {
  const supabase = await createClient();
  const [{ data: snaps }, { data: ov }] = await Promise.all([
    supabase
      .from("snapshots")
      .select("metrics, score, computed_at")
      .eq("user_id", userId)
      .order("computed_at", { ascending: false })
      .limit(30),
    supabase.from("overrides").select("data").eq("user_id", userId).maybeSingle(),
  ]);
  if (!snaps?.length) return null;
  const parsed = overridesSchema.safeParse(ov?.data ?? {});
  const history = snaps.map((s) => ({ at: s.computed_at as string, score: s.score as number })).reverse();
  return buildPortfolio(snaps[0].metrics as BuilderMetrics, parsed.success ? parsed.data : EMPTY_OVERRIDES, history, {
    isDemo: false,
    isPublic,
  });
}

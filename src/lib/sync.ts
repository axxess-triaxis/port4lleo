import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { createGitHubClient } from "@/lib/github/client";
import { collectBuilderMetrics } from "@/lib/github/collect";
import { getUserAccessToken } from "@/lib/github/userToken";
import { applyOverrides, EMPTY_OVERRIDES, overridesSchema } from "@/lib/overrides/overrides";
import { fetchProfileYaml } from "@/lib/overrides/profileYaml";
import { computeScore } from "@/lib/scoring/score";

export const SYNC_COOLDOWN_MS = 60 * 60 * 1000;

/** Milliseconds until an on-demand sync is allowed again (0 = now). */
export function syncCooldownRemainingMs(lastSyncedAt: string | null | undefined, now = Date.now()): number {
  const last = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
  return Math.max(0, last + SYNC_COOLDOWN_MS - now);
}

export interface SyncResult {
  score: number;
  tier: string;
  login: string;
  warnings: string[];
}

/**
 * Collects fresh metrics for one user and stores a snapshot. Uses the admin client:
 * callers are responsible for authorising the request (signed-in owner, or cron secret).
 */
export async function syncUser(admin: SupabaseClient, userId: string): Promise<SyncResult> {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("login, include_private")
    .eq("id", userId)
    .single();
  if (pErr || !profile) throw new Error("Profile not found");

  const gh = createGitHubClient(await getUserAccessToken(admin, userId));

  // With a GitHub App, private repos are readable only where the user installed the app
  // on their own account -- that installation *is* the opt-in.
  const { data: ownInstall } = await admin
    .from("installations")
    .select("id")
    .ilike("account_login", profile.login.replace(/[%_\\]/g, "\\$&"))
    .is("suspended_at", null)
    .maybeSingle();
  const includePrivate = !!ownInstall;
  if (includePrivate !== profile.include_private) {
    await admin.from("profiles").update({ include_private: includePrivate }).eq("id", userId);
  }

  const { data: vercelRow } = await admin.from("vercel_tokens").select("ciphertext").eq("user_id", userId).maybeSingle();
  const vercelToken = vercelRow ? decrypt(vercelRow.ciphertext) : null;

  const warnings: string[] = [];
  const raw = await collectBuilderMetrics(gh, {
    login: profile.login,
    includePrivate,
    vercelToken,
  });

  // portfolio.yml is GitHub-hosted state, so it is folded into the snapshot at sync time.
  const yml = await fetchProfileYaml(gh, profile.login).catch((e) => ({
    overrides: EMPTY_OVERRIDES,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (yml.error) warnings.push(`portfolio.yml ignored: ${yml.error}`);
  const metrics = applyOverrides(raw, yml.overrides);

  // Dashboard-edited overrides are applied at read time too; include them in the stored score.
  const { data: ov } = await admin.from("overrides").select("data").eq("user_id", userId).maybeSingle();
  const dbOverrides = overridesSchema.safeParse(ov?.data ?? {});
  const result = computeScore(applyOverrides(metrics, dbOverrides.success ? dbOverrides.data : EMPTY_OVERRIDES));

  const { error: sErr } = await admin.from("snapshots").insert({ user_id: userId, metrics, score: result.score });
  if (sErr) throw new Error(`Saving snapshot failed: ${sErr.message}`);
  // Retention (stated in /privacy): keep the 30 most recent snapshots.
  const { data: old } = await admin
    .from("snapshots")
    .select("id")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .range(30, 1000);
  if (old?.length) await admin.from("snapshots").delete().in("id", old.map((r) => r.id));
  await admin
    .from("profiles")
    .update({
      last_synced_at: new Date().toISOString(),
      name: metrics.profile.name,
      avatar_url: metrics.profile.avatarUrl,
    })
    .eq("id", userId);

  for (const [k, v] of Object.entries(metrics.errors)) warnings.push(`${k}: ${v}`);
  return { score: result.score, tier: result.tier, login: profile.login, warnings };
}

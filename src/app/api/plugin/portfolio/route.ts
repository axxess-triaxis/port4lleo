import { NextResponse, type NextRequest } from "next/server";
import { authenticatePluginRequest } from "@/lib/plugin/auth";
import { tierFor } from "@/lib/scoring/score";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { syncCooldownRemainingMs } from "@/lib/sync";

/** GET /api/plugin/portfolio -- the token owner's stored score, tier and last sync (Claude plugin). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const auth = await authenticatePluginRequest(admin, request);
  if (!auth.ok) return auth.response;

  const { data: profile } = await admin
    .from("profiles")
    .select("login, is_public, last_synced_at")
    .eq("id", auth.userId)
    .maybeSingle<{ login: string; is_public: boolean; last_synced_at: string | null }>();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: snap } = await admin
    .from("snapshots")
    .select("score, computed_at")
    .eq("user_id", auth.userId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ score: number; computed_at: string }>();

  const wait = syncCooldownRemainingMs(profile.last_synced_at);
  return NextResponse.json({
    login: profile.login,
    score: snap?.score ?? null,
    tier: snap ? tierFor(snap.score) : null,
    computedAt: snap?.computed_at ?? null,
    lastSyncedAt: profile.last_synced_at,
    isPublic: profile.is_public,
    resyncAvailableAt: new Date(Date.now() + wait).toISOString(),
    portfolioUrl: new URL(`/u/${profile.login}`, request.nextUrl.origin).toString(),
  });
}

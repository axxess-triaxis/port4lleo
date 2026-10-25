import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { authenticatePluginRequest } from "@/lib/plugin/auth";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { syncCooldownRemainingMs, syncUser } from "@/lib/sync";

export const maxDuration = 300;

/**
 * POST /api/plugin/resync -- re-collect the token owner's metrics on the server (Claude plugin).
 * Same hourly cooldown as the dashboard's "Sync now". The request body is ignored: metrics are
 * only ever collected here, never accepted from the client.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const auth = await authenticatePluginRequest(admin, request);
  if (!auth.ok) return auth.response;

  const { data: profile } = await admin.from("profiles").select("last_synced_at").eq("id", auth.userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const wait = syncCooldownRemainingMs(profile.last_synced_at);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Synced recently. Try again in ${Math.ceil(wait / 60000)} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  try {
    const result = await syncUser(admin, auth.userId);
    revalidatePath(`/u/${result.login}`);
    return NextResponse.json({ ...result, syncedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}

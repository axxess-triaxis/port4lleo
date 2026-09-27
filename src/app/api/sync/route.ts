import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SYNC_COOLDOWN_MS, syncUser } from "@/lib/sync";

export const maxDuration = 300;

/** POST /api/sync -- re-collect the signed-in user's metrics (max once per hour). */
export async function POST() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("last_synced_at").eq("id", user.id).single();
  const last = profile?.last_synced_at ? new Date(profile.last_synced_at).getTime() : 0;
  const wait = last + SYNC_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    return NextResponse.json(
      { error: `Synced recently. Try again in ${Math.ceil(wait / 60000)} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  try {
    const result = await syncUser(admin, user.id);
    revalidatePath(`/u/${result.login}`);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}

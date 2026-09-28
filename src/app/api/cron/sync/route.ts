import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/server";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

const BATCH = 10;
const STALE_AFTER_MS = 20 * 60 * 60 * 1000;

/** GET /api/cron/sync -- Vercel Cron: re-sync the stalest profiles, a batch at a time. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: due, error } = await admin
    .from("profiles")
    .select("id, login")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const p of due ?? []) {
    try {
      const r = await syncUser(admin, p.id);
      revalidatePath(`/u/${r.login}`);
      results.push({ login: p.login, ok: true, score: r.score });
    } catch (e) {
      results.push({ login: p.login, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ synced: results.length, results });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserAccessToken } from "@/lib/github/userToken";
import { AUDIT_COOLDOWN_MS, auditInstallation } from "@/lib/governance/service";
import { viewerInstallations } from "@/lib/installations";
import { createAdminClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 300;

/** POST /api/governance/audit {installationId} -- run an audit now (max once per hour). */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = z.object({ installationId: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "installationId required" }, { status: 400 });
  const { installationId } = parsed.data;

  const admin = createAdminClient();
  // Authorize against GitHub, not our DB: the viewer must currently see this installation.
  const token = await getUserAccessToken(admin, user.id);
  const visible = await viewerInstallations(token);
  if (!visible.some((i) => i.id === installationId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: inst } = await admin.from("installations").select("last_audit_at").eq("id", installationId).maybeSingle();
  const { data: prev } = await admin
    .from("audits")
    .select("summary")
    .eq("installation_id", installationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // An audit that could see no repositories scanned nothing; it shouldn't block a re-run
  // once the user has fixed the installation's repository access.
  const prevScannedSomething = ((prev?.summary as { reposAudited?: number } | null)?.reposAudited ?? 0) > 0;
  const last = inst?.last_audit_at ? new Date(inst.last_audit_at).getTime() : 0;
  const wait = last + AUDIT_COOLDOWN_MS - Date.now();
  if (prevScannedSomething && wait > 0) {
    return NextResponse.json({ error: `Audited recently. Try again in ${Math.ceil(wait / 60000)} min.` }, { status: 429 });
  }

  try {
    return NextResponse.json({ ok: true, summary: await auditInstallation(admin, installationId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Audit failed" }, { status: 502 });
  }
}

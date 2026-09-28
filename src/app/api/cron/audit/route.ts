import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron";
import { auditInstallation } from "@/lib/governance/service";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Audits are heavier than portfolio syncs; keep batches small to fit the 300 s budget. */
const BATCH = 3;
const STALE_AFTER_MS = 20 * 60 * 60 * 1000;

/** GET /api/cron/audit -- Vercel Cron: re-audit the stalest active installations. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: due, error } = await admin
    .from("installations")
    .select("id, account_login")
    .is("suspended_at", null)
    .or(`last_audit_at.is.null,last_audit_at.lt.${cutoff}`)
    .order("last_audit_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const i of due ?? []) {
    try {
      results.push({ account: i.account_login, ok: true, summary: await auditInstallation(admin, i.id) });
    } catch (e) {
      results.push({ account: i.account_login, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ audited: results.length, results });
}

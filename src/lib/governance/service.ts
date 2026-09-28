import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { installationClient } from "@/lib/github/app";
import { runAudit, summarize } from "./audit";
import type { AuditReport, AuditSummary } from "./types";

export const AUDIT_COOLDOWN_MS = 60 * 60 * 1000;

/** Runs a full audit for one installation with an installation token and stores it. */
export async function auditInstallation(admin: SupabaseClient, installationId: number): Promise<AuditSummary> {
  const { data: inst } = await admin
    .from("installations")
    .select("account_login, suspended_at")
    .eq("id", installationId)
    .single();
  if (!inst) throw new Error(`Unknown installation ${installationId}`);
  if (inst.suspended_at) throw new Error("Installation is suspended");

  const report = await runAudit(await installationClient(installationId), inst.account_login);
  const summary = summarize(report);
  const { error } = await admin.from("audits").insert({ installation_id: installationId, report, summary });
  if (error) throw new Error(`Saving audit failed: ${error.message}`);
  await admin.from("installations").update({ last_audit_at: new Date().toISOString() }).eq("id", installationId);
  // Keep the last 30 audits per installation.
  const { data: old } = await admin
    .from("audits")
    .select("id")
    .eq("installation_id", installationId)
    .order("created_at", { ascending: false })
    .range(30, 1000);
  if (old?.length) await admin.from("audits").delete().in("id", old.map((a) => a.id));
  return summary;
}

export async function latestAudit(
  admin: SupabaseClient,
  installationId: number,
): Promise<{ report: AuditReport; summary: AuditSummary; created_at: string } | null> {
  const { data } = await admin
    .from("audits")
    .select("report, summary, created_at")
    .eq("installation_id", installationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { report: AuditReport; summary: AuditSummary; created_at: string } | null;
}

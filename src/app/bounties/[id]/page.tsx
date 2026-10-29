import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { BountyActions } from "@/components/bounties/BountyActions";
import { money, StatusPill } from "@/components/bounties/BountyBits";
import { viewerCanManage } from "@/lib/bounties/github";
import { BountyError, getBounty, toPublic } from "@/lib/bounties/service";
import { currentViewer } from "@/lib/bounties/viewer";
import { createGitHubClient } from "@/lib/github/client";
import { paypalConfig } from "@/lib/paypal/config";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fix bounty" };

const CHECK_LABEL: Record<string, string> = {
  pr_in_repo: "Pull request is in the bounty's repository",
  pr_merged: "Pull request is merged",
  pr_into_default_branch: "Merged into the default branch",
  author_is_claimant: "Pull request author is the claimant",
  merged_after_funding: "Merged after the bounty was funded",
  alert_fixed: "GitHub reports the Dependabot alert fixed",
};

export default async function BountyPage({ params }: PageProps<"/bounties/[id]">) {
  await connection();
  const { id } = await params;
  if (!isSupabaseConfigured() || !z.string().uuid().safeParse(id).success) notFound();
  const admin = createAdminClient();
  const viewer = await currentViewer(admin);
  let row;
  try {
    row = await getBounty(admin, viewer, id);
  } catch (e) {
    if (e instanceof BountyError) notFound();
    throw e;
  }
  const b = toPublic(row, viewer);
  const canManage = viewer ? (await viewerCanManage(createGitHubClient(viewer.token), b.repo)).ok : false;
  const v = b.verification;
  const cfg = paypalConfig();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <p className="text-sm text-ink-3">
        <Link href="/bounties" className="hover:underline">Fix bounties</Link> / {b.repo} #{b.alert_number}
      </p>
      <header className="card space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Fix {b.package} in {b.repo}
          </h1>
          <span className="text-3xl font-semibold tabular">{money(b.amount_value, b.currency)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
          <StatusPill status={b.status} />
          <span className="font-medium uppercase text-[11px]">{b.severity}</span>
          <a href={b.alert_url} target="_blank" rel="noreferrer" className="text-accent-ink underline">
            Dependabot alert #{b.alert_number}
          </a>
          <span>Funded by @{b.funder_login}</span>
          {!(cfg?.live ?? false) && <span className="text-[var(--warn-ink)]">PayPal sandbox (test money)</span>}
        </div>
        {b.summary && <p className="text-ink-2">{b.summary}</p>}
      </header>

      {b.claimant_login && (
        <section className="card space-y-1 p-6 text-sm">
          <h2 className="font-semibold">Claim</h2>
          <p>
            @{b.claimant_login} claimed with{" "}
            {b.pr_url && (
              <a href={b.pr_url} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                pull request #{b.pr_number}
              </a>
            )}
            {b.payout_email_masked && <span className="text-ink-3"> · payout to {b.payout_email_masked}</span>}
          </p>
        </section>
      )}

      {v && (
        <section className="card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Verification</h2>
            <span className={`text-sm font-semibold ${v.recommendation === "pay" ? "text-[var(--good)]" : "text-[var(--warn-ink)]"}`}>
              Recommendation: {v.recommendation === "pay" ? "pay" : "don't pay"}
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {v.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className={c.passed ? "text-[var(--good)]" : "text-[var(--warn-ink)]"}>{c.passed ? "Pass" : "Fail"}</span>
                <span>{CHECK_LABEL[c.id] ?? c.id}</span>
                <span className="text-ink-3">({c.detail})</span>
              </li>
            ))}
          </ul>
          {v.agent ? (
            <div className="space-y-2 rounded-lg bg-surface-2 p-4 text-sm">
              <p className="font-medium">
                AI agent ({v.agent.model}): {v.agent.recommendation} · confidence {Math.round(v.agent.confidence * 100)}% · PayPal order{" "}
                {v.agent.paypalOrderStatus ?? "not confirmed"}
              </p>
              {v.agent.reasons.length > 0 && (
                <ul className="list-disc pl-5 text-ink-2">{v.agent.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              )}
              {v.agent.risks.length > 0 && (
                <p className="text-[var(--warn-ink)]">Risks: {v.agent.risks.join("; ")}</p>
              )}
              <p className="text-xs text-ink-3">
                Tools used: {v.agent.toolCalls.join(", ") || "none"}. The agent can only recommend; it has no way to pay. A
                failed check overrides it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-2">
              {v.agentError ? `The AI agent couldn't run (${v.agentError}).` : "The AI agent runs once every hard check passes."}
            </p>
          )}
          <p className="text-xs text-ink-3">Checked {new Date(v.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
        </section>
      )}

      {b.status === "paid" && (
        <section className="card p-6 text-sm">
          <h2 className="font-semibold">Paid via PayPal Payouts</h2>
          <p className="text-ink-2">
            Batch {b.payout_batch_id} · status {b.payout_status ?? "pending"}
            {b.paid_at && ` · ${new Date(b.paid_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
          </p>
        </section>
      )}

      <BountyActions
        id={b.id}
        status={b.status}
        currency={b.currency}
        signedIn={!!viewer}
        isFunder={viewer?.userId === b.funder_user_id}
        isClaimant={!!viewer && viewer.userId === b.claimant_user_id}
        canManage={canManage}
        recommendation={b.agent_recommendation}
        paypalClientId={cfg?.clientId ?? null}
      />
    </div>
  );
}

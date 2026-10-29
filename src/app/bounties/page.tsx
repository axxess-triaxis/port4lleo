import type { Metadata } from "next";
import { connection } from "next/server";
import { BountyRowCard } from "@/components/bounties/BountyBits";
import { bountiesForUser, openPublicBounties, toPublic } from "@/lib/bounties/service";
import { currentViewer } from "@/lib/bounties/viewer";
import { paypalConfig } from "@/lib/paypal/config";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fix bounties" };

export default async function BountiesPage() {
  await connection();
  const configured = isSupabaseConfigured();
  const admin = configured ? createAdminClient() : null;
  const viewer = admin ? await currentViewer(admin) : null;
  const open = admin ? (await openPublicBounties(admin)).map((b) => toPublic(b, viewer)) : [];
  const mine = admin && viewer ? (await bountiesForUser(admin, viewer.userId)).map((b) => toPublic(b, viewer)) : [];
  const sandbox = !(paypalConfig()?.live ?? false);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Fix bounties</h1>
        <p className="max-w-2xl text-ink-2">
          Organisations put a PayPal bounty on a security alert PORT4LLEO found in their repositories. Fix it, claim with
          your pull request, and once GitHub confirms the alert is fixed, an AI agent checks the work and a maintainer
          approves, PayPal pays you.
        </p>
        {sandbox && (
          <p className="inline-block rounded-lg border border-[var(--warn-ink)] px-3 py-1 text-sm text-[var(--warn-ink)]">
            PayPal sandbox: test money only. No real payments are made.
          </p>
        )}
      </header>

      {viewer && mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Your bounties</h2>
          <ul className="space-y-2">{mine.map((b) => <BountyRowCard key={b.id} b={b} />)}</ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open bounties on public repositories</h2>
        {open.length === 0 ? (
          <p className="card p-6 text-sm text-ink-2">
            No open bounties right now. Maintainers fund them from the Governance tab on a Dependabot alert.
          </p>
        ) : (
          <ul className="space-y-2">{open.map((b) => <BountyRowCard key={b.id} b={b} />)}</ul>
        )}
      </section>
    </div>
  );
}

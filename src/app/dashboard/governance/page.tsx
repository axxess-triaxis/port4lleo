/* eslint-disable @next/next/no-img-element -- GitHub avatars */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuditButton } from "@/components/AuditButton";
import { AuditView } from "@/components/AuditView";
import { installUrl } from "@/lib/github/app";
import { getUserAccessToken } from "@/lib/github/userToken";
import { filterReportForViewer, summarize } from "@/lib/governance/audit";
import { latestAudit } from "@/lib/governance/service";
import { upsertInstallations, viewerInstallations, viewerRepos } from "@/lib/installations";
import { createAdminClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Governance" };

export default async function GovernancePage({ searchParams }: PageProps<"/dashboard/governance">) {
  await connection();
  if (!isSupabaseConfigured()) redirect("/?error=not-configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const admin = createAdminClient();
  const token = await getUserAccessToken(admin, user.id);
  // Authorization comes from GitHub on every load, not from our tables.
  const installations = await viewerInstallations(token);
  await upsertInstallations(admin, installations);

  const { i } = await searchParams;
  const selected = installations.find((x) => String(x.id) === i) ?? installations[0];
  const install = installUrl();

  let body: React.ReactNode;
  if (!selected) {
    body = (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Install PORT4LEO to audit your repositories</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-2">
          Install the app on your account or an organization, choose the repositories, and PORT4LEO audits them for open
          Dependabot alerts, commits shipped without a passing test run, stale PRs, conflict-resolution merges, possible
          unmasked PII and repository sprawl. It has read-only access.
        </p>
        {install && (
          <a href={install} className="mt-4 inline-block rounded-lg bg-ink px-5 py-2.5 font-medium text-bg">
            Install on GitHub
          </a>
        )}
      </div>
    );
  } else {
    const audit = await latestAudit(admin, selected.id);
    if (!audit) {
      body = (
        <div className="card space-y-3 p-6">
          <p className="text-sm text-ink-2">No audit yet for {selected.account.login}. The first one runs right after install.</p>
          <AuditButton installationId={selected.id} />
        </div>
      );
    } else {
      const visible = filterReportForViewer(audit.report, await viewerRepos(token, selected.id));
      body = (
        <div className="space-y-4">
          <AuditButton installationId={selected.id} />
          {/* Summary is recomputed from the filtered report so counts never include hidden repos. */}
          <AuditView report={visible} summary={summarize(visible)} at={audit.created_at} />
        </div>
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link> / Governance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Repository governance</h1>
        </div>
        {installations.length > 0 && (
          <nav className="flex flex-wrap gap-2" aria-label="Installations">
            {installations.map((x) => (
              <Link
                key={x.id}
                href={`/dashboard/governance?i=${x.id}`}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  x.id === selected?.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface"
                }`}
              >
                <img src={x.account.avatar_url} alt="" width={18} height={18} className="rounded-full" />
                {x.account.login}
              </Link>
            ))}
            {install && (
              <a href={install} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-ink-2">
                + Add account
              </a>
            )}
          </nav>
        )}
      </header>
      {body}
    </div>
  );
}

import Link from "next/link";
import { FundBountyButton } from "@/components/bounties/FundBountyButton";
import { alertNumberFromUrl } from "@/lib/bounties/model";
import type { AuditReport, AuditSummary, RepoAudit } from "@/lib/governance/types";

/** A live fix bounty on one alert, keyed "owner/repo#alertNumber". */
export interface AlertBounty {
  id: string;
  status: string;
  amount: string;
  currency: string;
}

interface BountyProps {
  /** Present when the viewer may fund bounties from this view (PayPal configured). */
  installationId?: number;
  bounties?: Record<string, AlertBounty>;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "moderate", "low", "unknown"];

function Stat({ label, value, alert, testId }: { label: string; value: number; alert?: boolean; testId: string }) {
  return (
    <div className="card p-4" data-testid={testId}>
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular ${alert && value > 0 ? "text-[var(--warn-ink)]" : ""}`}>{value}</p>
    </div>
  );
}

function RepoCard({ r, installationId, bounties }: { r: RepoAudit } & BountyProps) {
  const deps = [...r.dependabot.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const pii = r.pii.findings.filter((f) => !f.likelyBenign);
  const errors = [r.dependabot, r.stalePrs, r.conflictMerges, r.untestedDeploys, r.pii].filter((c) => c.error).length;
  const issues = deps.length + r.stalePrs.stale.length + r.conflictMerges.findings.length + r.untestedDeploys.findings.length + pii.length;

  return (
    <details className="card p-4" open={issues > 0}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {r.repo}
          {r.private && <span className="ml-2 rounded-full border border-line px-1.5 text-[10px] text-ink-3">private</span>}
        </span>
        <span className="text-xs text-ink-2 tabular">
          {issues === 0 ? "No issues found" : `${issues} issue${issues === 1 ? "" : "s"}`}
          {errors > 0 && ` · ${errors} check${errors === 1 ? "" : "s"} unavailable`}
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {r.dependabot.disabled && <p className="text-[var(--warn-ink)]">Dependabot alerts are disabled for this repository.</p>}
        {r.dependabot.accessDenied && <p className="text-ink-3">Dependabot alerts not readable with the granted permissions (not the same as clean).</p>}
        {deps.length > 0 && (
          <Section title={`Dependabot alerts (${deps.length})`}>
            {deps.slice(0, 10).map((f, i) => (
              <li key={i}>
                <span className="font-medium uppercase text-[11px]">{f.severity}</span> {f.package}: {f.summary}{" "}
                {f.url && <a href={f.url} className="text-accent-ink underline" target="_blank" rel="noreferrer">view</a>}
                <AlertBountySlot repo={r.repo} url={f.url} installationId={installationId} bounties={bounties} />
              </li>
            ))}
          </Section>
        )}
        {r.stalePrs.stale.length > 0 && (
          <Section title={`Stale PRs, open more than 10 days (${r.stalePrs.stale.length})`}>
            {r.stalePrs.stale.slice(0, 10).map((p) => (
              <li key={p.number}>
                <a href={p.url} className="underline" target="_blank" rel="noreferrer">#{p.number}</a> {p.title}{" "}
                <span className="text-ink-3">({p.daysOpen} days)</span>
              </li>
            ))}
          </Section>
        )}
        {r.untestedDeploys.findings.length > 0 && (
          <Section
            title={`Commits without a passing test run (${r.untestedDeploys.findings.length} of ${r.untestedDeploys.commitsChecked} checked${
              r.untestedDeploys.commitsSkipped ? `; ${r.untestedDeploys.commitsSkipped} bot or [skip ci] commits ignored` : ""
            })`}
          >
            {r.untestedDeploys.findings.map((c) => (
              <li key={c.sha}>
                <code className="font-mono text-xs">{c.sha}</code> {c.messageSummary}{" "}
                <span className="text-ink-3">{c.reason === "no_test_run" ? "no test run" : "tests failed"}</span>
              </li>
            ))}
          </Section>
        )}
        {r.conflictMerges.findings.length > 0 && (
          <Section title={`Merges that resolved conflicts (${r.conflictMerges.findings.length}, lower bound)`}>
            {r.conflictMerges.findings.map((c) => (
              <li key={c.sha}>
                <code className="font-mono text-xs">{c.sha}</code> {c.messageSummary}
              </li>
            ))}
          </Section>
        )}
        {pii.length > 0 && (
          <Section title={`Possible unmasked PII (${pii.length}; candidates to confirm, masked)`}>
            {pii.map((f, i) => (
              <li key={i}>
                <code className="font-mono text-xs">{f.path}</code> {f.kind.replace("_", " ")}{" "}
                <code className="font-mono text-xs text-ink-3">{f.maskedExcerpt}</code>
              </li>
            ))}
          </Section>
        )}
        <p className="text-xs text-ink-3">Scanned {r.pii.filesScanned} files for PII.</p>
      </div>
    </details>
  );
}

function AlertBountySlot({ repo, url, installationId, bounties }: { repo: string; url: string } & BountyProps) {
  const n = alertNumberFromUrl(url);
  if (!n) return null;
  const live = bounties?.[`${repo}#${n}`];
  if (live) {
    return (
      <Link href={`/bounties/${live.id}`} className="ml-2 rounded-full border border-accent px-2 text-[11px] font-medium text-accent-ink">
        {new Intl.NumberFormat("en-US", { style: "currency", currency: live.currency }).format(Number(live.amount))} bounty · {live.status}
      </Link>
    );
  }
  return installationId ? <FundBountyButton installationId={installationId} repo={repo} alertNumber={n} /> : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-ink-2">{title}</h4>
      <ul className="list-disc space-y-0.5 pl-5">{children}</ul>
    </div>
  );
}

export function AuditView({
  report,
  summary,
  at,
  manageUrl,
  installationId,
  bounties,
}: BountyProps & {
  report: AuditReport;
  summary: AuditSummary;
  at: string;
  /** GitHub page where this installation's repository access is configured. */
  manageUrl: string;
}) {
  const s = summary;
  // Zeros from an audit that scanned nothing must never read as a clean bill of health.
  if (report.repos.length === 0) {
    const noAccess = report.reposInInstallation === 0;
    return (
      <div className="card border-[var(--warn-ink)] p-6" data-testid="gov-nothing-scanned">
        <h2 className="font-semibold text-[var(--warn-ink)]">Nothing was scanned</h2>
        <p className="mt-2 text-sm text-ink-2">
          {noAccess
            ? `PORT4LLEO can't see any repositories in ${report.account}. The installation has no repository access, so this audit checked nothing.`
            : `None of the ${report.reposInInstallation} repositories in this installation are ones you can access on GitHub, so there is nothing to show you.`}
        </p>
        {noAccess && (
          <a href={manageUrl} className="mt-3 inline-block text-sm font-medium text-accent-ink underline" target="_blank" rel="noreferrer">
            Choose repositories on GitHub
          </a>
        )}
        <p className="mt-3 text-xs text-ink-3">
          Last attempt {new Date(at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Adding repositories
          starts a new audit automatically, or use &ldquo;Run audit now&rdquo;.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat testId="gov-critical" label="Critical/high alerts" value={s.dependabotCriticalHigh} alert />
        <Stat testId="gov-dependabot" label="Open Dependabot alerts" value={s.dependabotOpen} alert />
        <Stat testId="gov-untested" label="Untested commits" value={s.untestedCommits} alert />
        <Stat testId="gov-stale" label="Stale PRs" value={s.stalePrs} />
        <Stat testId="gov-pii" label="Possible PII" value={s.piiFindings} alert />
        <Stat testId="gov-dupes" label="Near-duplicate repos" value={s.nearDuplicates} />
      </div>
      {s.dependabotDisabled > 0 && (
        <p className="text-sm text-[var(--warn-ink)]">
          Dependabot alerts are disabled on {s.dependabotDisabled} repositor{s.dependabotDisabled === 1 ? "y" : "ies"}.
        </p>
      )}
      <p className="text-xs text-ink-3">
        Audited {new Date(at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}: {report.repos.length} of{" "}
        {report.reposInInstallation} repositories you can access (the {report.limits.maxRepos} most recently pushed are
        audited; last {report.limits.commitLookback} commits and up to {report.limits.maxPiiFiles} files per repo).{" "}
        {report.sprawl.totalActiveRepos} active repositories in this account
        {report.sprawl.overThreshold ? ", above the sprawl threshold of 15" : ""}.
      </p>
      {report.sprawl.nearDuplicates.length > 0 && (
        <div className="card p-4 text-sm">
          <h3 className="mb-1 font-semibold">Near-duplicate repository names</h3>
          <ul className="list-disc pl-5">
            {report.sprawl.nearDuplicates.map((d) => (
              <li key={`${d.repoA}-${d.repoB}`}>
                {d.repoA} / {d.repoB} <span className="text-ink-3 tabular">({Math.round(d.similarity * 100)}% similar)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-3">
        {report.repos.map((r) => (
          <RepoCard key={r.repo} r={r} installationId={installationId} bounties={bounties} />
        ))}
      </div>
    </div>
  );
}

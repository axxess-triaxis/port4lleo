/* eslint-disable @next/next/no-img-element -- GitHub avatars; no image optimisation needed */
import type { Portfolio } from "@/lib/portfolio";
import type { Provenance, RepoRef } from "@/lib/types";
import { Heatmap } from "./Heatmap";
import { ScoreHistory } from "./ScoreHistory";
import { formatNumber, statTiles, type StatTile } from "./stats";

const PROVENANCE_LABEL: Record<StatTile["provenance"], string> = {
  native: "GitHub",
  inferred: "inferred",
  "self-declared": "self-declared",
  mixed: "inferred + declared",
};

function ProvenanceTag({ p }: { p: StatTile["provenance"] | Provenance }) {
  const cls =
    p === "native"
      ? "border-line text-ink-3"
      : p === "self-declared"
        ? "border-dashed border-ink-3 text-ink-2"
        : "border-accent-soft text-accent-ink";
  return <span className={`rounded-full border px-1.5 py-px text-[10px] leading-4 ${cls}`}>{PROVENANCE_LABEL[p]}</span>;
}

function Tile({ t }: { t: StatTile }) {
  return (
    <div className="card flex flex-col gap-1 p-4" data-testid={`stat-${t.key}`} title={t.error ? `Unavailable: ${t.error}` : t.hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{t.label}</span>
        <ProvenanceTag p={t.provenance} />
      </div>
      <span className="text-2xl font-semibold tracking-tight tabular">{formatNumber(t.value)}</span>
      <span className="text-[11px] text-ink-3">{t.error ? "Unavailable for this account" : t.hint}</span>
    </div>
  );
}

function ScoreCard({ p }: { p: Portfolio }) {
  const { score } = p;
  return (
    <section className="card p-5" aria-labelledby="score-h">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="score-h" className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Builder Score
          </h2>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular" data-testid="builder-score">
            {score.score}
            <span className="text-lg font-normal text-ink-3"> / 1000</span>
          </p>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink" data-testid="builder-tier">
          {score.tier}
        </span>
      </div>

      <div className="mt-5 space-y-3" data-testid="score-breakdown">
        {score.categories.map((c) => (
          <div key={c.category} title={`${c.category}: ${c.points.toFixed(0)} of ${c.maxPoints} points`}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-ink-2">{c.category}</span>
              <span className="tabular text-ink">
                {c.points.toFixed(0)} <span className="text-ink-3">/ {c.maxPoints}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full bg-accent"
                style={{ width: `${Math.max(c.points > 0 ? 2 : 0, (c.points / c.maxPoints) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <h3 className="mb-1 text-xs font-medium text-ink-2">Score over time</h3>
        <ScoreHistory points={p.history} />
      </div>
    </section>
  );
}

function RepoList({ title, items, testId }: { title: string; items: RepoRef[]; testId: string }) {
  return (
    <section className="card p-5" data-testid={testId}>
      <h2 className="mb-3 text-sm font-semibold">
        {title} <span className="font-normal text-ink-3 tabular">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">None detected yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 12).map((r) => (
            <li key={`${r.nameWithOwner}-${r.reason}`} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                {r.url ? (
                  <a href={r.url} className="font-medium hover:underline" target="_blank" rel="noreferrer">
                    {r.nameWithOwner.split("/").pop()}
                  </a>
                ) : (
                  <span className="font-medium">{r.nameWithOwner}</span>
                )}
                {r.description && <p className="truncate text-xs text-ink-3">{r.description}</p>}
              </div>
              <span className="shrink-0 text-[11px] text-ink-3">
                {r.provenance === "self-declared" ? <ProvenanceTag p="self-declared" /> : r.reason}
              </span>
            </li>
          ))}
          {items.length > 12 && <li className="text-xs text-ink-3">+{items.length - 12} more</li>}
        </ul>
      )}
    </section>
  );
}

function Integrations({ p }: { p: Portfolio }) {
  const top = p.metrics.integrations.slice(0, 10);
  const max = Math.max(1, ...top.map((i) => i.repos));
  return (
    <section className="card p-5" data-testid="integrations">
      <h2 className="mb-1 text-sm font-semibold">Integrations most used</h2>
      <p className="mb-3 text-xs text-ink-3">Repos whose root manifest depends on the service</p>
      {top.length === 0 ? (
        <p className="text-sm text-ink-3">No known integrations found in root manifests.</p>
      ) : (
        <ul className="space-y-2">
          {top.map((i) => (
            <li key={i.name} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-sm" title={`${i.name} (${i.category}): ${i.repos} repos`}>
              <span className="truncate">{i.name}</span>
              <span className="h-2 rounded-r bg-surface-2">
                <span className="block h-2 rounded-r bg-accent" style={{ width: `${(i.repos / max) * 100}%` }} />
              </span>
              <span className="text-right text-xs tabular text-ink-2">{i.repos}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Languages({ p }: { p: Portfolio }) {
  const langs = p.metrics.languages.slice(0, 8);
  if (langs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {langs.map((l) => (
        <span key={l.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color ?? "var(--text-3)" }} />
          {l.name} <span className="text-ink-3 tabular">{l.repos}</span>
        </span>
      ))}
    </div>
  );
}

export function PortfolioView({ p }: { p: Portfolio }) {
  const m = p.metrics;
  const collected = new Date(m.collectedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {p.isDemo && (
        <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-2 text-sm text-ink-2" data-testid="demo-banner">
          Demo data for a fictional builder. <a href="/auth/signin" className="font-medium text-accent-ink underline">Connect GitHub</a> to generate yours.
        </div>
      )}

      <header className="flex flex-wrap items-center gap-4">
        <img src={m.profile.avatarUrl} alt="" width={72} height={72} className="rounded-full border border-line" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{m.profile.name ?? m.profile.login}</h1>
          <p className="text-sm text-ink-2">
            <a href={m.profile.url} className="hover:underline" target="_blank" rel="noreferrer">
              @{m.profile.login}
            </a>
            {" · "}builder since {new Date(m.profile.createdAt).getUTCFullYear()}
            {" · "}
            {formatNumber(m.repos.stars)} stars
          </p>
          {m.profile.bio && <p className="mt-1 text-sm text-ink-2">{m.profile.bio}</p>}
          <div className="mt-2">
            <Languages p={p} />
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <ScoreCard p={p} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="stat-grid">
          {statTiles(m).map((t) => (
            <Tile key={t.key} t={t} />
          ))}
        </div>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Contributions, last 12 months</h2>
        <Heatmap days={m.calendar} />
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <RepoList title="Apps built" items={m.appsBuilt} testId="list-apps" />
        <RepoList title="Apps deployed" items={m.appsDeployed} testId="list-deployed" />
        <RepoList title="Hackathons" items={m.hackathons} testId="list-hackathons" />
        <RepoList title="Prototypes" items={m.prototypes} testId="list-prototypes" />
        <Integrations p={p} />
        <details className="card p-5 text-sm" data-testid="score-table">
          <summary className="cursor-pointer font-semibold">Score breakdown table</summary>
          <table className="mt-3 w-full text-xs">
            <thead className="text-left text-ink-3">
              <tr>
                <th className="py-1 font-medium">Metric</th>
                <th className="py-1 text-right font-medium">Value</th>
                <th className="py-1 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {p.score.metrics.map((s) => (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-1">{s.label}</td>
                  <td className="py-1 text-right">{formatNumber(s.raw)}</td>
                  <td className="py-1 text-right">
                    {s.points.toFixed(1)} <span className="text-ink-3">/ {s.maxPoints}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <p className="text-xs text-ink-3">
        Collected {collected} UTC{m.includesPrivate ? " · includes private repos (counts only)" : " · public repos only"}.{" "}
        <a href="/scoring" className="underline">How this is calculated</a>.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { ACTIVITY_HALF_LIFE_YEARS, CATEGORIES, MAX_SCORE, SELF_DECLARED_FACTOR, TIERS, WEIGHTS } from "@/lib/scoring/weights";

export const metadata: Metadata = { title: "How scoring works" };

export default function ScoringPage() {
  const unit = MAX_SCORE / 100;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">How the Builder Score works</h1>
        <p className="mt-2 text-ink-2">
          The score runs from 0 to {MAX_SCORE}. It is a pure function of the collected metrics, so the same snapshot
          always gives the same score. The formula lives in <code className="font-mono text-sm">src/lib/scoring</code>.
        </p>
      </header>

      <section className="card space-y-2 p-5 text-sm text-ink-2">
        <p>
          <strong className="text-ink">Log scaling.</strong> Each metric is normalised as{" "}
          <code className="font-mono">min(1, ln(1+x) / ln(1+cap))</code>. The first few units count most, and nothing
          scores beyond its cap, so mass-produced commits or repos stop paying off.
        </p>
        <p>
          <strong className="text-ink">Recency.</strong> Merged PRs and contributions are bucketed by year and decay with
          a {ACTIVITY_HALF_LIFE_YEARS}-year half-life, so recent work moves the score. Actions and test runs are
          all-time counts, because GitHub doesn&apos;t expose them by year cheaply.
        </p>
        <p>
          <strong className="text-ink">Self-declared items</strong> (from portfolio.yml or the dashboard) count at{" "}
          {SELF_DECLARED_FACTOR * 100}% of a detected one.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Weights</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Metric</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium">Max points</th>
                <th className="px-4 py-2 text-right font-medium">Saturates at</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {CATEGORIES.flatMap((c) =>
                WEIGHTS.filter((w) => w.category === c).map((w) => (
                  <tr key={w.key} className="border-t border-line">
                    <td className="px-4 py-2">{w.label}</td>
                    <td className="px-4 py-2 text-ink-2">{w.category}</td>
                    <td className="px-4 py-2 text-right">{w.weight * unit}</td>
                    <td className="px-4 py-2 text-right">{w.cap.toLocaleString("en-US")}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tiers</h2>
        <p className="text-sm text-ink-2">
          {[...TIERS].reverse().map((t, i, a) => `${t.name} ${t.min}${a[i + 1] ? `–${a[i + 1].min - 1}` : "+"}`).join(" · ")}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">What is inferred</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li><strong className="text-ink">Test runs passed</strong> counts successful runs of workflows named like test/CI/e2e. It counts runs, not individual test cases.</li>
          <li><strong className="text-ink">Apps built</strong> needs an app topic, or an app framework (Next.js, Expo, FastAPI…) in a root manifest plus a homepage or deployment.</li>
          <li><strong className="text-ink">Apps deployed</strong> needs a successful GitHub Deployment or an external homepage URL. Homepage reachability is not checked.</li>
          <li><strong className="text-ink">Vercel projects</strong> are repos with deployments created by the Vercel GitHub app, or come from the Vercel API when you add a token.</li>
          <li><strong className="text-ink">Hackathons and prototypes</strong> come from repo topics, names and descriptions, plus anything you declare.</li>
          <li><strong className="text-ink">Integrations</strong> are read from root package.json, requirements.txt and pyproject.toml only, so packages nested inside a monorepo are missed.</li>
          <li><strong className="text-ink">Actions runs</strong> cover your 100 most recently pushed repos.</li>
        </ul>
      </section>
    </div>
  );
}

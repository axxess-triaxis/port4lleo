import Link from "next/link";
import { WEIGHTS } from "@/lib/scoring/weights";

const ERRORS: Record<string, string> = {
  "not-configured": "This deployment has no Supabase configuration yet. See the README to set it up.",
  oauth: "GitHub sign-in could not start. Try again.",
  exchange: "GitHub sign-in did not complete. Try again.",
  "no-github-token": "GitHub did not return an access token. Check the OAuth app configuration.",
  profile: "Could not save your profile. Try again.",
  "missing-code": "Sign-in link was incomplete. Try again.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      {message && (
        <p role="alert" className="mb-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          {message}
        </p>
      )}
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Your GitHub, as a builder portfolio.</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-2">
        Connect GitHub and get a shareable page of what you have shipped: apps built and deployed, merged PRs, test runs,
        hackathons, prototypes, the integrations you use most, and a transparent Builder Score out of 1000.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/auth/signin" className="rounded-lg bg-ink px-5 py-2.5 font-medium text-bg hover:opacity-90">
          Connect GitHub
        </Link>
        <Link href="/u/demo" className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:bg-surface-2">
          See a demo portfolio
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        A read-only GitHub App. It reads public data by default, and private repos only where you install it. Private
        repos are counted, never named.
      </p>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          ["Evidence, not vibes", "Every number links back to a GitHub API source. Heuristic counts are labelled “inferred”."],
          ["Transparent score", "Twelve weighted, log-scaled metrics with recency decay. The weights are public and forkable."],
          ["Governance built in", "Install on an org to audit Dependabot alerts, untested deploys, stale PRs, exposed PII and repo sprawl. Findings are only visible to people with repo access."],
        ].map(([t, d]) => (
          <div key={t} className="card p-5">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-ink-2">{d}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-sm text-ink-3">
        Measures: {WEIGHTS.map((w) => w.label).join(" · ")}.
      </p>
    </div>
  );
}

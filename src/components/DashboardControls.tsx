"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

const noopSubscribe = () => () => {};

interface Props {
  login: string;
  isPublic: boolean;
  includePrivate: boolean;
  lastSyncedAt: string | null;
  overridesYaml: string;
}

const EXAMPLE = `hackathons:
  - name: Smart India Hackathon 2025
    url: https://example.com/my-entry
prototypes:
  - name: Voice agent paper prototype
apps: []
exclude: []   # owner/repo entries to drop from inferred lists
`;

async function send(url: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(url, init);
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed (${res.status})`;
}

export function DashboardControls({ login, isPublic, includePrivate, lastSyncedAt, overridesYaml }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [yaml, setYaml] = useState(overridesYaml);
  const [vercel, setVercel] = useState("");

  const run = (fn: () => Promise<string | null>, ok: string) =>
    start(async () => {
      setMsg(null);
      const err = await fn();
      setMsg(err ? { kind: "err", text: err } : { kind: "ok", text: ok });
      if (!err) router.refresh();
    });

  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const badge = `[![Builder Score](${origin}/api/badge/${login})](${origin}/u/${login})`;

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => send("/api/sync", { method: "POST" }), "Synced. Your portfolio is up to date.")}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            {pending ? "Working…" : "Sync now"}
          </button>
          <a href={`/u/${login}`} className="text-sm font-medium text-accent-ink underline">
            View public page
          </a>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              defaultChecked={isPublic}
              disabled={pending}
              onChange={(e) =>
                run(
                  () => send("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublic: e.target.checked }) }),
                  e.target.checked ? "Portfolio is public." : "Portfolio is private.",
                )
              }
            />
            Public portfolio
          </label>
          <span className="text-xs text-ink-3">
            Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "never"}. Syncs daily, or once an hour on demand.
          </span>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button className="text-sm text-ink-2 hover:text-ink">Sign out</button>
          </form>
        </div>

        {msg && (
          <p role="status" className={`text-sm ${msg.kind === "err" ? "text-[var(--warn-ink)]" : "text-ink-2"}`}>
            {msg.text}
          </p>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Settings: private repos, Vercel, README badge</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="card p-4">
              <h3 className="font-medium">Private repositories</h3>
              <p className="mt-1 text-xs text-ink-2">
                {includePrivate ? "Included (counts only, names are never shown). " : "Not included. "}
                Including them needs GitHub&apos;s <code>repo</code> scope. GitHub only offers that scope as full
                read/write; BuilderScore only reads.
              </p>
              <a href={includePrivate ? "/auth/signin" : "/auth/signin?private=1"} className="mt-2 inline-block text-xs font-medium text-accent-ink underline">
                {includePrivate ? "Switch to public-only" : "Re-connect with private repos"}
              </a>
            </div>
            <div className="card p-4">
              <h3 className="font-medium">Vercel token (optional)</h3>
              <p className="mt-1 text-xs text-ink-2">Reads your project list for an exact count. Stored encrypted. Use a read-only token.</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={vercel}
                  onChange={(e) => setVercel(e.target.value)}
                  placeholder="Vercel access token"
                  className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs"
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={pending || vercel.length < 10}
                  className="rounded-md border border-line px-2 text-xs disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const err = await send("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vercelToken: vercel }) });
                      if (!err) setVercel("");
                      return err;
                    }, "Vercel token saved. It is used from the next sync.")
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-ink-3 underline"
                  onClick={() =>
                    run(() => send("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vercelToken: null }) }), "Vercel token removed.")
                  }
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="font-medium">README badge</h3>
              <code className="mt-2 block break-all rounded-md bg-surface-2 p-2 text-[11px]">{badge}</code>
              <button type="button" className="mt-2 text-xs font-medium text-accent-ink underline" onClick={() => navigator.clipboard.writeText(badge)}>
                Copy
              </button>
            </div>
          </div>
        </details>

        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Corrections: hackathons, prototypes, apps GitHub can&apos;t see</summary>
          <p className="mt-2 text-xs text-ink-2">
            Same format as a <code>portfolio.yml</code> in your <code>{login}/{login}</code> profile repo. Both are
            merged. Self-declared items are labelled and count at half weight.
          </p>
          <textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            placeholder={EXAMPLE}
            rows={10}
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-line bg-bg p-3 font-mono text-xs"
          />
          <button
            type="button"
            disabled={pending}
            className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            onClick={() => run(() => send("/api/overrides", { method: "PUT", body: yaml }), "Corrections saved.")}
          >
            Save corrections
          </button>
        </details>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface PluginTokenRow {
  id: string;
  last4: string;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

/** Create (shown once) and revoke the tokens that link the Claude plugin to this account. */
export function PluginTokens({ tokens }: { tokens: PluginTokenRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const call = (init: RequestInit, onOk: (body: { token?: string }) => void) =>
    start(async () => {
      setErr(null);
      const res = await fetch("/api/plugin/tokens", init);
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok) return setErr(body.error ?? `Request failed (${res.status})`);
      onOk(body);
      router.refresh();
    });

  const active = tokens.filter((t) => !t.revoked);

  return (
    <details className="text-sm" data-testid="plugin-tokens">
      <summary className="cursor-pointer font-medium">Claude plugin: link your account</summary>
      <p className="mt-2 text-xs text-ink-2">
        A token lets the PORT4LLEO Claude plugin read your stored score and ask this site to re-sync. It can&apos;t
        change settings, fund, claim or pay anything. Paste it into the plugin&apos;s <code>api_token</code> setting.
        Tokens are stored hashed; we can&apos;t show one again.
      </p>

      {created && (
        <div className="card mt-3 p-3" role="status">
          <p className="text-xs font-medium">New token. Copy it now; it won&apos;t be shown again.</p>
          <code className="mt-2 block break-all rounded-md bg-surface-2 p-2 text-[11px]">{created}</code>
          <button type="button" className="mt-2 text-xs font-medium text-accent-ink underline" onClick={() => navigator.clipboard.writeText(created)}>
            Copy
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-[var(--warn-ink)]">{err}</p>}

      <button
        type="button"
        disabled={pending}
        className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        onClick={() => call({ method: "POST" }, (b) => setCreated(b.token ?? null))}
      >
        Create token
      </button>

      {tokens.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3">
              <code>p4l_…{t.last4}</code>
              <span className="text-ink-3">created {new Date(t.created_at).toLocaleDateString()}</span>
              <span className="text-ink-3">
                {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}
              </span>
              {t.revoked ? (
                <span className="text-ink-3">revoked</span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  className="text-ink-2 underline disabled:opacity-50"
                  onClick={() =>
                    call(
                      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) },
                      () => setCreated(null),
                    )
                  }
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && tokens.length > 0 && <p className="mt-2 text-xs text-ink-3">No active tokens.</p>}
    </details>
  );
}

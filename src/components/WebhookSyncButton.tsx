"use client";

import { useState, useTransition } from "react";

export function WebhookSyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await fetch("/api/admin/webhook-secret", { method: "POST" });
            const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
            setMsg(res.ok ? { ok: true, text: `Done. GitHub now delivers to ${body.url} with this deployment's secret.` } : { ok: false, text: body.error ?? `Failed (${res.status})` });
          })
        }
      >
        {pending ? "Syncing…" : "Sync GitHub App webhook secret"}
      </button>
      {msg && (
        <p role="status" data-testid="webhook-sync-result" className={`text-sm ${msg.ok ? "text-ink-2" : "text-[var(--warn-ink)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

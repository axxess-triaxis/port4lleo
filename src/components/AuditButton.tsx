"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AuditButton({ installationId }: { installationId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await fetch("/api/governance/audit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ installationId }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) setMsg(body.error ?? `Audit failed (${res.status})`);
            else router.refresh();
          })
        }
      >
        {pending ? "Auditing… (up to a few minutes)" : "Run audit now"}
      </button>
      {msg && (
        <span role="status" className="text-sm text-[var(--warn-ink)]">
          {msg}
        </span>
      )}
    </div>
  );
}

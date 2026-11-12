"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** "Fund a bounty" on one Dependabot alert in the audit view: creates a draft, then checkout. */
export function FundBountyButton({ installationId, repo, alertNumber }: { installationId: number; repo: string; alertNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ml-2 text-xs font-medium text-accent-ink underline">
        Fund a fix bounty
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMsg(null);
          const res = await fetch("/api/bounties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId, repo, alertNumber, amount }),
          });
          const body = (await res.json().catch(() => ({}))) as { bounty?: { id: string }; error?: string };
          if (!res.ok || !body.bounty) setMsg(body.error ?? `Failed (${res.status})`);
          else router.push(`/bounties/${body.bounty.id}`);
        });
      }}
    >
      <label className="text-xs text-ink-2" htmlFor={`amt-${repo}-${alertNumber}`}>
        Bounty (USD)
      </label>
      <input
        id={`amt-${repo}-${alertNumber}`}
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 rounded border border-line bg-surface px-2 py-1 text-sm tabular"
      />
      <button type="submit" disabled={pending} className="rounded bg-ink px-3 py-1 text-xs font-medium text-bg disabled:opacity-50">
        {pending ? "Creating…" : "Continue to PayPal"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-3">
        Cancel
      </button>
      {msg && (
        <span role="status" className="text-xs text-[var(--warn-ink)]">
          {msg}
        </span>
      )}
    </form>
  );
}

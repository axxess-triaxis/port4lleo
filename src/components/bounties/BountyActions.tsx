"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BountyStatus } from "@/lib/bounties/model";

interface Props {
  id: string;
  status: BountyStatus;
  currency: string;
  signedIn: boolean;
  isFunder: boolean;
  isClaimant: boolean;
  canManage: boolean;
  recommendation: "pay" | "reject" | null;
  /** PayPal REST client id (public by design: it identifies the app to the PayPal JS SDK). */
  paypalClientId: string | null;
}

async function post(path: string, body: unknown = {}) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export function BountyActions(p: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [prUrl, setPrUrl] = useState("");
  const [email, setEmail] = useState("");
  const base = `/api/bounties/${p.id}`;

  const run = (label: string, fn: () => Promise<unknown>) =>
    start(async () => {
      setMsg(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setMsg(`${label}: ${e instanceof Error ? e.message : "failed"}`);
      }
    });

  const button = (label: string, onClick: () => void, tone: "primary" | "plain" = "primary") => (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={
        tone === "primary"
          ? "rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          : "rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50"
      }
    >
      {label}
    </button>
  );

  let body: React.ReactNode = null;

  if (p.status === "draft" && p.isFunder) {
    body = p.paypalClientId ? (
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-ink-2">Pay with PayPal to fund this bounty. Funds are held until a verified fix is approved, or refunded if you cancel before anyone claims it.</p>
        <PayPalScriptProvider options={{ clientId: p.paypalClientId, currency: p.currency, intent: "capture" }}>
          <PayPalButtons
            style={{ layout: "vertical", label: "pay" }}
            createOrder={async () => (await post(`${base}/order`)).orderId!}
            onApprove={async (data) => {
              await post(`${base}/capture`, { orderId: data.orderID });
              router.refresh();
            }}
            onError={(err) => setMsg(`PayPal: ${err instanceof Error ? err.message : "checkout failed"}`)}
          />
        </PayPalScriptProvider>
        {button("Discard draft", () => run("Cancel", () => post(`${base}/cancel`)), "plain")}
      </div>
    ) : (
      <p className="text-sm text-[var(--warn-ink)]">PayPal isn&apos;t configured on this deployment.</p>
    );
  } else if (p.status === "funded") {
    if (p.isFunder) {
      body = button("Cancel and refund", () => run("Refund", () => post(`${base}/cancel`)), "plain");
    } else if (!p.signedIn) {
      body = (
        <a href="/auth/signin" className="text-sm font-medium text-accent-ink underline">
          Sign in with GitHub to claim this bounty
        </a>
      );
    } else {
      body = (
        <form
          className="max-w-lg space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("Claim", () => post(`${base}/claim`, { prUrl, paypalEmail: email }));
          }}
        >
          <p className="text-sm text-ink-2">Fixed it? Claim with the pull request that resolves the alert. You&apos;ll be paid by PayPal once the fix is verified and approved.</p>
          <label className="block text-sm">
            Pull request URL
            <input required value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
          </label>
          <label className="block text-sm">
            PayPal email to be paid at
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border border-line bg-surface px-3 py-2" />
          </label>
          <p className="text-xs text-ink-3">Stored encrypted and shown to nobody; used only for the payout.</p>
          <button type="submit" disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-50">
            {pending ? "Claiming…" : "Claim bounty"}
          </button>
        </form>
      );
    }
  } else if (p.status === "claimed" && (p.isClaimant || p.isFunder || p.canManage)) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        {button(pending ? "Verifying… (checks + AI agent)" : "Verify the fix", () => run("Verify", () => post(`${base}/verify`)))}
        {p.canManage && !p.isClaimant && button("Reject claim", () => run("Reject", () => post(`${base}/reject`, { reason: "Rejected by repository admin" })), "plain")}
      </div>
    );
  } else if (p.status === "verified" && p.canManage && !p.isClaimant) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        {p.recommendation === "pay" && button(pending ? "Paying via PayPal…" : "Approve and pay", () => run("Payout", () => post(`${base}/approve`)))}
        {button("Reject claim", () => run("Reject", () => post(`${base}/reject`, { reason: "Rejected by repository admin" })), "plain")}
      </div>
    );
  } else if (p.status === "verified") {
    body = <p className="text-sm text-ink-2">Verified. Waiting for a repository admin to approve the payout.</p>;
  }

  return (
    <div className="space-y-2">
      {body}
      {msg && (
        <p role="status" className="text-sm text-[var(--warn-ink)]">
          {msg}
        </p>
      )}
    </div>
  );
}

import Link from "next/link";
import type { BountyStatus } from "@/lib/bounties/model";
import type { PublicBounty } from "@/lib/bounties/service";

const STATUS_LABEL: Record<BountyStatus, string> = {
  draft: "Awaiting payment",
  funded: "Open",
  claimed: "Claimed, awaiting verification",
  verified: "Verified, awaiting approval",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function StatusPill({ status }: { status: BountyStatus }) {
  const tone =
    status === "paid"
      ? "border-[var(--good)] text-[var(--good)]"
      : status === "funded"
        ? "border-accent text-accent-ink"
        : status === "cancelled" || status === "refunded"
          ? "border-line text-ink-3"
          : "border-[var(--warn-ink)] text-[var(--warn-ink)]";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}

export function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
}

export function BountyRowCard({ b }: { b: PublicBounty }) {
  return (
    <li className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <Link href={`/bounties/${b.id}`} className="font-medium hover:underline">
          {b.repo} · {b.package}
        </Link>
        <p className="text-sm text-ink-2">
          <span className="font-medium uppercase text-[11px]">{b.severity}</span> Dependabot #{b.alert_number}
          {b.summary ? `: ${b.summary}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill status={b.status} />
        <span className="text-lg font-semibold tabular">{money(b.amount_value, b.currency)}</span>
      </div>
    </li>
  );
}

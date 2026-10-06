import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { money } from "@/components/bounties/BountyBits";
import { PortfolioView } from "@/components/PortfolioView";
import { paidFixesFor } from "@/lib/bounties/service";
import { getPortfolioByLogin } from "@/lib/portfolio";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const p = await getPortfolioByLogin(username);
  if (!p) return { title: "Not found" };
  const name = p.metrics.profile.name ?? p.metrics.profile.login;
  return {
    title: `${name} (${p.score.score})`,
    description: `${name}'s builder portfolio: Builder Score ${p.score.score} (${p.score.tier}).`,
  };
}

export default async function UserPortfolioPage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const p = await getPortfolioByLogin(username);
  if (!p) notFound();
  const fixes = isSupabaseConfigured() && username !== "demo" ? await paidFixesFor(createAdminClient(), p.metrics.profile.login).catch(() => []) : [];
  return (
    <>
      <PortfolioView p={p} />
      {fixes.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-12" aria-labelledby="paid-fixes">
          <h2 id="paid-fixes" className="mb-3 text-lg font-semibold">
            Paid security fixes <span className="text-sm font-normal text-ink-3">verified by PORT4LLEO, paid via PayPal</span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {fixes.map((f) => (
              <li key={f.id} className="card flex items-center justify-between gap-3 p-4 text-sm">
                <span>
                  <span className="font-medium uppercase text-[11px]">{f.severity}</span> {f.package} in {f.repo}{" "}
                  {f.pr_url && (
                    <a href={f.pr_url} className="text-accent-ink underline" target="_blank" rel="noreferrer">
                      PR
                    </a>
                  )}
                </span>
                <span className="font-semibold tabular">{money(f.amount_value, f.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

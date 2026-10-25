import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { viewerInstallations, viewerRepos } from "@/lib/installations";
import { liveBountiesForRepos, openPublicBounties, type BountyRow } from "./service";

/**
 * Read-only bounty listing for the Claude plugin. Like audits, access is checked live against
 * GitHub with the caller's own user token: a bounty on a private repo is listed only while the
 * caller can see that repo through a PORT4LLEO installation. Funding, claiming, approving and
 * paying stay on the website.
 */

/** Statuses worth showing: money is in and the bounty is not finished. */
const LISTED = new Set(["funded", "claimed", "verified"]);
const MAX_INSTALLATIONS = 20;
const IN_CHUNK = 100;

export interface PluginBounty {
  id: string;
  url: string;
  repo: string;
  alertNumber: number;
  alertUrl: string;
  severity: string;
  package: string;
  summary: string;
  amount: string;
  currency: string;
  status: string;
  claimantLogin: string | null;
  prUrl: string | null;
  fundedAt: string | null;
  role: "funder" | "claimant" | null;
}

/** Only fields safe to show anyone who may see the bounty: no PayPal ids, emails or verification internals. */
export function toPluginBounty(row: BountyRow, userId: string, origin: string): PluginBounty {
  return {
    id: row.id,
    url: new URL(`/bounties/${row.id}`, origin).toString(),
    repo: row.repo,
    alertNumber: row.alert_number,
    alertUrl: row.alert_url,
    severity: row.severity,
    package: row.package,
    summary: row.summary,
    amount: String(row.amount_value),
    currency: row.currency,
    status: row.status,
    claimantLogin: row.claimant_login,
    prUrl: row.pr_url,
    fundedAt: row.funded_at,
    role: row.funder_user_id === userId ? "funder" : row.claimant_user_id === userId ? "claimant" : null,
  };
}

export interface PluginBountyDeps {
  installations: typeof viewerInstallations;
  repos: typeof viewerRepos;
  live: typeof liveBountiesForRepos;
  open: typeof openPublicBounties;
}

const defaultDeps: PluginBountyDeps = {
  installations: viewerInstallations,
  repos: viewerRepos,
  live: liveBountiesForRepos,
  open: openPublicBounties,
};

export async function bountiesForPlugin(
  admin: SupabaseClient,
  user: { userId: string; token: string },
  origin: string,
  deps: PluginBountyDeps = defaultDeps,
): Promise<{ bounties: PluginBounty[]; reposChecked: number }> {
  const installs = (await deps.installations(user.token)).slice(0, MAX_INSTALLATIONS);
  const repos = new Set<string>();
  for (const i of installs) for (const r of await deps.repos(user.token, i.id)) repos.add(r);

  const list = [...repos];
  const rows = new Map<string, BountyRow>();
  for (let i = 0; i < list.length; i += IN_CHUNK) {
    for (const b of (await deps.live(admin, list.slice(i, i + IN_CHUNK))).values()) rows.set(b.id, b);
  }
  // Public repos are visible to everyone; the public board covers their open bounties.
  for (const b of await deps.open(admin)) if (!b.repo_private) rows.set(b.id, b);

  const bounties = [...rows.values()]
    .filter((b) => LISTED.has(b.status))
    .sort((a, b) => (b.funded_at ?? "").localeCompare(a.funded_at ?? ""))
    .map((b) => toPluginBounty(b, user.userId, origin));
  return { bounties, reposChecked: list.length };
}

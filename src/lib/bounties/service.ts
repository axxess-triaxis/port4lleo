import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { installationClient } from "@/lib/github/app";
import { createGitHubClient } from "@/lib/github/client";
import { viewerInstallations, viewerRepos } from "@/lib/installations";
import { captureBountyOrder, createBountyOrder, refundCapture } from "@/lib/paypal/orders";
import { sendBountyPayout } from "@/lib/paypal/rest";
import { runVerificationAgent } from "./agent";
import { agentDeps } from "./agentDeps";
import { collectFixEvidence, viewerCanManage } from "./github";
import {
  allPassed,
  evaluateHardChecks,
  finalRecommendation,
  isPlausibleEmail,
  maskEmail,
  nextStatus,
  parseAmount,
  parsePullRequestUrl,
  type AgentReport,
  type BountyAction,
  type BountyStatus,
  type HardCheck,
} from "./model";

/**
 * Fix bounty operations. Every state change is a conditional update on the expected
 * status, so concurrent clicks can't double-fund, double-claim or double-pay; PayPal calls
 * also carry per-bounty request ids. Authorization is checked live against GitHub.
 */

export class BountyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Viewer {
  userId: string;
  login: string;
  token: string; // the viewer's own GitHub user token
}

export interface BountyRow {
  id: string;
  installation_id: number | null;
  repo: string;
  repo_private: boolean;
  alert_number: number;
  alert_url: string;
  severity: string;
  package: string;
  summary: string;
  amount_value: string;
  currency: string;
  status: BountyStatus;
  funder_user_id: string;
  funder_login: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  claimant_user_id: string | null;
  claimant_login: string | null;
  pr_number: number | null;
  pr_url: string | null;
  payout_email_ciphertext: string | null;
  verification: Verification | null;
  agent_recommendation: "pay" | "reject" | null;
  payout_batch_id: string | null;
  payout_status: string | null;
  created_at: string;
  funded_at: string | null;
  paid_at: string | null;
}

export interface Verification {
  at: string;
  checks: HardCheck[];
  agent: AgentReport | null;
  agentError: string | null;
  recommendation: "pay" | "reject";
}

/** A bounty as the browser may see it: never the payout email, ciphertext included. */
export type PublicBounty = Omit<BountyRow, "payout_email_ciphertext"> & { payout_email_masked: string | null };

export function toPublic(row: BountyRow, viewer?: Viewer | null): PublicBounty {
  const { payout_email_ciphertext, ...rest } = row;
  // Only the claimant sees (a mask of) where their money goes.
  let masked: string | null = null;
  if (payout_email_ciphertext && viewer && viewer.userId === row.claimant_user_id) {
    try {
      masked = maskEmail(decrypt(payout_email_ciphertext));
    } catch {
      masked = null;
    }
  }
  return { ...rest, amount_value: String(rest.amount_value), payout_email_masked: masked };
}

const COLUMNS =
  "id, installation_id, repo, repo_private, alert_number, alert_url, severity, package, summary, amount_value, currency, status, funder_user_id, funder_login, paypal_order_id, paypal_capture_id, claimant_user_id, claimant_login, pr_number, pr_url, payout_email_ciphertext, verification, agent_recommendation, payout_batch_id, payout_status, created_at, funded_at, paid_at";

async function load(admin: SupabaseClient, id: string): Promise<BountyRow> {
  const { data } = await admin.from("bounties").select(COLUMNS).eq("id", id).maybeSingle<BountyRow>();
  if (!data) throw new BountyError("Bounty not found", 404);
  return data;
}

async function event(admin: SupabaseClient, bountyId: string, kind: string, actor: string | null, detail: Record<string, unknown> = {}) {
  await admin.from("bounty_events").insert({ bounty_id: bountyId, kind, actor_login: actor, detail });
}

/** Moves `from` -> next(action) only if the row is still in `from`. */
async function transition(
  admin: SupabaseClient,
  row: BountyRow,
  action: BountyAction,
  patch: Record<string, unknown> = {},
): Promise<BountyRow> {
  const to = nextStatus(row.status, action);
  if (!to) throw new BountyError(`Can't ${action.replace("_", " ")} a bounty that is ${row.status}`, 409);
  const { data } = await admin
    .from("bounties")
    .update({ ...patch, status: to, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", row.status)
    .select(COLUMNS)
    .maybeSingle<BountyRow>();
  if (!data) throw new BountyError("The bounty changed in the meantime; reload and try again", 409);
  return data;
}

/** Private-repo bounties are visible only to people who can see the repo on GitHub. */
export async function assertCanView(viewer: Viewer | null, row: BountyRow) {
  if (!row.repo_private) return;
  if (!viewer) throw new BountyError("Bounty not found", 404);
  const r = await createGitHubClient(viewer.token).rest(`/repos/${row.repo}`).catch(() => null);
  if (!r) throw new BountyError("Bounty not found", 404);
}

async function assertManager(viewer: Viewer, repo: string) {
  const { ok } = await viewerCanManage(createGitHubClient(viewer.token), repo);
  if (!ok) throw new BountyError("Only repository admins or maintainers can do this", 403);
}

// ---------------------------------------------------------------- create + fund

interface AlertJson {
  number: number;
  state: string;
  html_url: string;
  security_vulnerability?: { severity?: string; package?: { name?: string } };
  security_advisory?: { summary?: string };
}

export async function createBounty(
  admin: SupabaseClient,
  viewer: Viewer,
  input: { installationId: number; repo: string; alertNumber: number; amount: unknown },
): Promise<BountyRow> {
  const amount = parseAmount(input.amount);
  if (!amount) throw new BountyError("Amount must be between 1 and 500 (at most 2 decimals)", 400);

  const installs = await viewerInstallations(viewer.token);
  if (!installs.some((i) => i.id === input.installationId)) throw new BountyError("Installation not found", 404);
  const repos = await viewerRepos(viewer.token, input.installationId);
  if (!repos.includes(input.repo)) throw new BountyError("Repository not found", 404);
  const { ok, private: isPrivate } = await viewerCanManage(createGitHubClient(viewer.token), input.repo);
  if (!ok) throw new BountyError("Only repository admins or maintainers can fund bounties", 403);

  const gh = await installationClient(input.installationId);
  const alert = await gh.rest<AlertJson>(`/repos/${input.repo}/dependabot/alerts/${input.alertNumber}`).catch(() => null);
  if (!alert) throw new BountyError("Dependabot alert not found or not readable", 404);
  if (alert.state !== "open") throw new BountyError(`That alert is already ${alert.state}`, 409);

  const { data, error } = await admin
    .from("bounties")
    .insert({
      installation_id: input.installationId,
      repo: input.repo,
      repo_private: isPrivate,
      alert_number: alert.number,
      alert_url: alert.html_url,
      severity: alert.security_vulnerability?.severity ?? "unknown",
      package: alert.security_vulnerability?.package?.name ?? "unknown",
      summary: alert.security_advisory?.summary ?? "",
      amount_value: amount,
      funder_user_id: viewer.userId,
      funder_login: viewer.login,
    })
    .select(COLUMNS)
    .single<BountyRow>();
  if (error?.message.includes("bounties_one_live_per_alert")) throw new BountyError("This alert already has an open bounty", 409);
  if (error || !data) throw new BountyError(`Couldn't create the bounty: ${error?.message}`, 500);
  await event(admin, data.id, "created", viewer.login, { amount, currency: data.currency });
  return data;
}

export async function startFunding(admin: SupabaseClient, viewer: Viewer, id: string): Promise<{ orderId: string }> {
  const row = await load(admin, id);
  if (row.funder_user_id !== viewer.userId) throw new BountyError("Only the funder can pay for this bounty", 403);
  if (row.status !== "draft") throw new BountyError(`This bounty is already ${row.status}`, 409);
  const order = await createBountyOrder({
    bountyId: row.id,
    amount: Number(row.amount_value).toFixed(2),
    currency: row.currency,
    description: `PORT4LLEO fix bounty: ${row.repo} Dependabot #${row.alert_number} (${row.package})`,
  });
  await admin.from("bounties").update({ paypal_order_id: order.id, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "draft");
  await event(admin, row.id, "order_created", viewer.login, { orderId: order.id });
  return { orderId: order.id };
}

export async function completeFunding(admin: SupabaseClient, viewer: Viewer, id: string, orderId: string): Promise<BountyRow> {
  const row = await load(admin, id);
  if (row.funder_user_id !== viewer.userId) throw new BountyError("Only the funder can pay for this bounty", 403);
  if (row.paypal_order_id !== orderId) throw new BountyError("That PayPal order doesn't belong to this bounty", 400);
  const capture = await captureBountyOrder(orderId);
  const expected = Number(row.amount_value).toFixed(2);
  if (capture.status !== "COMPLETED" || !capture.captureId || capture.amount !== expected || capture.currency !== row.currency || capture.customId !== row.id) {
    await event(admin, row.id, "capture_mismatch", viewer.login, { status: capture.status, amount: capture.amount, currency: capture.currency });
    throw new BountyError(`PayPal capture not completed as expected (${capture.status})`, 402);
  }
  const funded = await transition(admin, row, "fund", { paypal_capture_id: capture.captureId, funded_at: new Date().toISOString() });
  await event(admin, row.id, "funded", viewer.login, { orderId, captureId: capture.captureId, amount: capture.amount });
  return funded;
}

// ---------------------------------------------------------------- claim + verify

export async function claimBounty(
  admin: SupabaseClient,
  viewer: Viewer,
  id: string,
  input: { prUrl: string; paypalEmail: string },
): Promise<BountyRow> {
  const row = await load(admin, id);
  await assertCanView(viewer, row);
  if (row.funder_user_id === viewer.userId) throw new BountyError("You can't claim a bounty you funded", 403);
  const pr = parsePullRequestUrl(input.prUrl);
  if (!pr || pr.repo.toLowerCase() !== row.repo.toLowerCase()) throw new BountyError(`Give a pull request URL in ${row.repo}`, 400);
  const email = input.paypalEmail.trim();
  if (!isPlausibleEmail(email)) throw new BountyError("Give the PayPal email address to be paid at", 400);

  const claimed = await transition(admin, row, "claim", {
    claimant_user_id: viewer.userId,
    claimant_login: viewer.login,
    pr_number: pr.number,
    pr_url: input.prUrl.trim(),
    payout_email_ciphertext: encrypt(email),
    claimed_at: new Date().toISOString(),
  });
  await event(admin, row.id, "claimed", viewer.login, { pr: pr.number });
  return claimed;
}

export async function verifyBounty(admin: SupabaseClient, viewer: Viewer, id: string): Promise<BountyRow> {
  const row = await load(admin, id);
  if (viewer.userId !== row.claimant_user_id && viewer.userId !== row.funder_user_id) {
    await assertManager(viewer, row.repo);
  }
  if (row.status !== "claimed") throw new BountyError(`Only claimed bounties can be verified (this one is ${row.status})`, 409);
  if (!row.installation_id || !row.pr_number || !row.claimant_login || !row.funded_at || !row.paypal_order_id) {
    throw new BountyError("This bounty is missing data needed for verification", 409);
  }

  const gh = await installationClient(row.installation_id);
  const { evidence, files } = await collectFixEvidence(gh, {
    repo: row.repo,
    alertNumber: row.alert_number,
    prNumber: row.pr_number,
    claimantLogin: row.claimant_login,
    fundedAt: row.funded_at,
  });
  const checks = evaluateHardChecks(evidence);

  // The agent only runs when the deterministic checks already pass: no tokens spent arguing
  // with a PR that isn't merged or isn't the claimant's.
  let agent: AgentReport | null = null;
  let agentError: string | null = null;
  if (allPassed(checks)) {
    try {
      agent = await runVerificationAgent({ bountyId: row.id, paypalOrderId: row.paypal_order_id, evidence, checks, files }, agentDeps());
    } catch (e) {
      agentError = e instanceof Error ? e.message.slice(0, 300) : "agent failed";
    }
  }
  const recommendation = finalRecommendation(checks, agent);
  const verification: Verification = { at: new Date().toISOString(), checks, agent, agentError, recommendation };

  const updated = await transition(admin, row, recommendation === "pay" ? "verify_pass" : "verify_fail", {
    verification,
    agent_recommendation: recommendation,
    verified_at: verification.at,
  });
  await event(admin, row.id, "verified", viewer.login, {
    recommendation,
    failedChecks: checks.filter((c) => !c.passed).map((c) => c.id),
    agentRecommendation: agent?.recommendation ?? null,
    agentError,
  });
  return updated;
}

// ---------------------------------------------------------------- approve / reject / cancel

export async function approveBounty(admin: SupabaseClient, viewer: Viewer, id: string): Promise<BountyRow> {
  const row = await load(admin, id);
  await assertManager(viewer, row.repo);
  if (viewer.userId === row.claimant_user_id) throw new BountyError("You can't approve your own payout", 403);
  if (row.status !== "verified" || row.agent_recommendation !== "pay") {
    throw new BountyError("Only bounties the checks and agent verified can be paid", 409);
  }
  if (!row.installation_id || !row.pr_number || !row.claimant_login || !row.funded_at || !row.payout_email_ciphertext) {
    throw new BountyError("This bounty is missing data needed for payout", 409);
  }

  // Re-check GitHub right before money moves: a revert after verification must not be paid.
  const gh = await installationClient(row.installation_id);
  const { evidence } = await collectFixEvidence(gh, {
    repo: row.repo,
    alertNumber: row.alert_number,
    prNumber: row.pr_number,
    claimantLogin: row.claimant_login,
    fundedAt: row.funded_at,
  });
  const recheck = evaluateHardChecks(evidence);
  if (!allPassed(recheck)) {
    await event(admin, row.id, "payout_blocked", viewer.login, { failedChecks: recheck.filter((c) => !c.passed).map((c) => c.id) });
    throw new BountyError("The fix no longer passes the checks (was it reverted?); payout blocked", 409);
  }

  const payout = await sendBountyPayout({
    bountyId: row.id,
    email: decrypt(row.payout_email_ciphertext),
    amount: Number(row.amount_value).toFixed(2),
    currency: row.currency,
    note: `Thank you for fixing Dependabot alert #${row.alert_number} (${row.package}) in ${row.repo}. Verified by PORT4LLEO.`,
  });
  const paid = await transition(admin, row, "approve", {
    approved_by_user_id: viewer.userId,
    payout_batch_id: payout.batchId,
    payout_status: payout.batchStatus,
    paid_at: new Date().toISOString(),
  });
  await event(admin, row.id, "paid", viewer.login, { batchId: payout.batchId, batchStatus: payout.batchStatus });
  return paid;
}

export async function rejectClaim(admin: SupabaseClient, viewer: Viewer, id: string, reason: string): Promise<BountyRow> {
  const row = await load(admin, id);
  await assertManager(viewer, row.repo);
  const reopened = await transition(admin, row, "reject", {
    claimant_user_id: null,
    claimant_login: null,
    pr_number: null,
    pr_url: null,
    payout_email_ciphertext: null,
    verification: null,
    agent_recommendation: null,
  });
  await event(admin, row.id, "claim_rejected", viewer.login, { previousClaimant: row.claimant_login, reason: reason.slice(0, 500) });
  return reopened;
}

export async function cancelBounty(admin: SupabaseClient, viewer: Viewer, id: string): Promise<BountyRow> {
  const row = await load(admin, id);
  if (row.funder_user_id !== viewer.userId) throw new BountyError("Only the funder can cancel this bounty", 403);
  if (row.status === "draft") {
    const cancelled = await transition(admin, row, "cancel");
    await event(admin, row.id, "cancelled", viewer.login);
    return cancelled;
  }
  if (row.status !== "funded" || !row.paypal_capture_id) throw new BountyError(`A ${row.status} bounty can't be cancelled`, 409);
  const refund = await refundCapture(row.paypal_capture_id, row.id);
  const refunded = await transition(admin, row, "cancel", { refund_id: refund.id });
  await event(admin, row.id, "refunded", viewer.login, { refundId: refund.id, status: refund.status });
  return refunded;
}

// ---------------------------------------------------------------- reads

export async function getBounty(admin: SupabaseClient, viewer: Viewer | null, id: string): Promise<BountyRow> {
  const row = await load(admin, id);
  await assertCanView(viewer, row);
  return row;
}

/** Public board: funded, unclaimed bounties on public repositories. */
export async function openPublicBounties(admin: SupabaseClient): Promise<BountyRow[]> {
  const { data } = await admin.from("bounties").select(COLUMNS).eq("status", "funded").eq("repo_private", false).order("funded_at", { ascending: false }).limit(100);
  return (data ?? []) as BountyRow[];
}

export async function bountiesForUser(admin: SupabaseClient, userId: string): Promise<BountyRow[]> {
  const { data } = await admin
    .from("bounties")
    .select(COLUMNS)
    .or(`funder_user_id.eq.${userId},claimant_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as BountyRow[];
}

/** Live bounties for alerts in these repos, keyed "repo#alert", for the audit view. */
export async function liveBountiesForRepos(admin: SupabaseClient, repos: string[]): Promise<Map<string, BountyRow>> {
  const out = new Map<string, BountyRow>();
  if (repos.length === 0) return out;
  const { data } = await admin.from("bounties").select(COLUMNS).in("repo", repos).in("status", ["draft", "funded", "claimed", "verified"]);
  for (const b of (data ?? []) as BountyRow[]) out.set(`${b.repo}#${b.alert_number}`, b);
  return out;
}

/** Paid fixes credited to a builder: shown on their public portfolio (public repos only). */
export async function paidFixesFor(admin: SupabaseClient, login: string) {
  const { data } = await admin
    .from("bounties")
    .select("id, repo, alert_number, severity, package, amount_value, currency, pr_url, paid_at")
    .eq("status", "paid")
    .eq("repo_private", false)
    .ilike("claimant_login", login)
    .order("paid_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

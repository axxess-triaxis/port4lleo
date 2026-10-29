import { requirePayPal, type PayPalConfig } from "./config";

/**
 * The PayPal APIs the server SDK and the Agent Toolkit don't cover: Payouts (paying the
 * fixer) and webhook signature verification. Plain REST with a client-credentials token.
 */

export async function accessToken(cfg: PayPalConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${cfg.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new Error(`PayPal auth failed (${res.status}): ${body?.error_description ?? "no token"}`);
  }
  return body.access_token;
}

export interface PayoutResult {
  batchId: string;
  batchStatus: string;
}

/** One-item payout to the fixer's PayPal email. sender_batch_id = bounty id makes it idempotent. */
export async function sendBountyPayout(
  input: { bountyId: string; email: string; amount: string; currency: string; note: string },
  fetchImpl: typeof fetch = fetch,
  cfg: PayPalConfig = requirePayPal(),
): Promise<PayoutResult> {
  const token = await accessToken(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.apiBase}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `bounty-payout-${input.bountyId}` },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: `bounty-${input.bountyId}`,
        email_subject: "You've been paid for a security fix",
        email_message: input.note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.email,
          amount: { value: input.amount, currency: input.currency },
          note: input.note.slice(0, 4000),
          sender_item_id: input.bountyId,
        },
      ],
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    message?: string;
    name?: string;
  } | null;
  const batchId = body?.batch_header?.payout_batch_id;
  if (!res.ok || !batchId) {
    // Never echo the request (it holds the payout email); PayPal's error name/message only.
    throw new Error(`PayPal payout failed (${res.status}): ${body?.name ?? ""} ${body?.message ?? ""}`.trim());
  }
  return { batchId, batchStatus: body?.batch_header?.batch_status ?? "PENDING" };
}

/** PayPal's own verification of a webhook delivery (POST /v1/notifications/verify-webhook-signature). */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
  fetchImpl: typeof fetch = fetch,
  cfg: PayPalConfig = requirePayPal(),
): Promise<boolean> {
  if (!cfg.webhookId) return false;
  const h = (name: string) => headers.get(name);
  const required = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (required.some((n) => !h(n))) return false;
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const token = await accessToken(cfg, fetchImpl);
  const res = await fetchImpl(`${cfg.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: cfg.webhookId,
      webhook_event: event,
    }),
  });
  const body = (await res.json().catch(() => null)) as { verification_status?: string } | null;
  return res.ok && body?.verification_status === "SUCCESS";
}

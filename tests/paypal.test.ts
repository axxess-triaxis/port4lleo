import { describe, expect, it, vi } from "vitest";
import { paypalConfig } from "@/lib/paypal/config";
import { sendBountyPayout, verifyWebhookSignature } from "@/lib/paypal/rest";

const env = { PAYPAL_CLIENT_ID: "cid", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "WH-1" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("PayPal config", () => {
  it("is off without credentials and sandbox by default", () => {
    expect(paypalConfig({})).toBeNull();
    expect(paypalConfig(env)).toMatchObject({ live: false, apiBase: "https://api-m.sandbox.paypal.com" });
  });

  it("goes live only with PAYPAL_ENV=live AND PAYPAL_ALLOW_LIVE=true", () => {
    expect(paypalConfig({ ...env, PAYPAL_ENV: "live" })!.live).toBe(false);
    expect(paypalConfig({ ...env, PAYPAL_ALLOW_LIVE: "true" })!.live).toBe(false);
    expect(paypalConfig({ ...env, PAYPAL_ENV: "live", PAYPAL_ALLOW_LIVE: "true" })).toMatchObject({
      live: true,
      apiBase: "https://api-m.paypal.com",
    });
  });
});

describe("payouts", () => {
  const cfg = paypalConfig(env)!;

  it("sends one idempotent item keyed by the bounty id and returns the batch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: "tok" }))
      .mockResolvedValueOnce(json(201, { batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } }));
    const out = await sendBountyPayout({ bountyId: "b-1", email: "dev@example.com", amount: "25.00", currency: "USD", note: "thanks" }, fetchMock, cfg);

    expect(out).toEqual({ batchId: "BATCH-1", batchStatus: "PENDING" });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/payments/payouts");
    expect((init.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("bounty-payout-b-1");
    const body = JSON.parse(String(init.body));
    expect(body.sender_batch_header.sender_batch_id).toBe("bounty-b-1");
    expect(body.items).toEqual([expect.objectContaining({ receiver: "dev@example.com", amount: { value: "25.00", currency: "USD" } })]);
  });

  it("reports a PayPal error without echoing the payout email", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { access_token: "tok" }))
      .mockResolvedValueOnce(json(422, { name: "INSUFFICIENT_FUNDS", message: "Sender has insufficient funds." }));
    const err = await sendBountyPayout({ bountyId: "b-1", email: "dev@example.com", amount: "25.00", currency: "USD", note: "x" }, fetchMock, cfg).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toContain("INSUFFICIENT_FUNDS");
    expect(err?.message).not.toContain("dev@example.com");
  });
});

describe("webhook verification", () => {
  const cfg = paypalConfig(env)!;
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-transmission-id": "t-1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-06T00:00:00Z",
  });

  it("trusts a delivery only when PayPal says SUCCESS", async () => {
    const ok = vi.fn().mockResolvedValueOnce(json(200, { access_token: "tok" })).mockResolvedValueOnce(json(200, { verification_status: "SUCCESS" }));
    expect(await verifyWebhookSignature(headers, '{"id":"WH-EVT"}', ok, cfg)).toBe(true);
    const bad = vi.fn().mockResolvedValueOnce(json(200, { access_token: "tok" })).mockResolvedValueOnce(json(200, { verification_status: "FAILURE" }));
    expect(await verifyWebhookSignature(headers, '{"id":"WH-EVT"}', bad, cfg)).toBe(false);
  });

  it("refuses without the transmission headers or a configured webhook id, without calling PayPal", async () => {
    const fetchMock = vi.fn();
    expect(await verifyWebhookSignature(new Headers(), "{}", fetchMock, cfg)).toBe(false);
    expect(await verifyWebhookSignature(headers, "{}", fetchMock, paypalConfig({ ...env, PAYPAL_WEBHOOK_ID: "" })!)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

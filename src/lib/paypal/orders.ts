import "server-only";
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
} from "@paypal/paypal-server-sdk";
import { requirePayPal, type PayPalConfig } from "./config";

/**
 * Bounty funding with PayPal Orders v2 through PayPal's official server SDK: the funder
 * approves in the PayPal JS SDK buttons, then the server captures. Refunds go back to the
 * funder through the Payments API when an unclaimed bounty is cancelled.
 */

function sdk(cfg: PayPalConfig) {
  const client = new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: cfg.clientId, oAuthClientSecret: cfg.clientSecret },
    environment: cfg.live ? Environment.Production : Environment.Sandbox,
    timeout: 20_000,
  });
  return { orders: new OrdersController(client), payments: new PaymentsController(client) };
}

export interface CreatedOrder {
  id: string;
  status: string;
}

export async function createBountyOrder(input: {
  bountyId: string;
  amount: string;
  currency: string;
  description: string;
}): Promise<CreatedOrder> {
  const { orders } = sdk(requirePayPal());
  const { result } = await orders.createOrder({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          referenceId: input.bountyId,
          customId: input.bountyId,
          description: input.description.slice(0, 127),
          amount: { currencyCode: input.currency, value: input.amount },
        },
      ],
    },
    // Idempotency: retrying the same bounty's order creation returns the same order.
    paypalRequestId: `bounty-order-${input.bountyId}`,
    prefer: "return=minimal",
  });
  if (!result.id) throw new Error("PayPal did not return an order id");
  return { id: result.id, status: String(result.status ?? "") };
}

export interface CapturedOrder {
  orderId: string;
  status: string;
  captureId: string | null;
  amount: string | null;
  currency: string | null;
  customId: string | null;
}

export async function captureBountyOrder(orderId: string): Promise<CapturedOrder> {
  const { orders } = sdk(requirePayPal());
  const { result } = await orders.captureOrder({
    id: orderId,
    paypalRequestId: `bounty-capture-${orderId}`,
    prefer: "return=representation",
  });
  const unit = result.purchaseUnits?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    orderId,
    status: String(result.status ?? ""),
    captureId: capture?.id ?? null,
    amount: capture?.amount?.value ?? null,
    currency: capture?.amount?.currencyCode ?? null,
    customId: capture?.customId ?? unit?.customId ?? null,
  };
}

export async function refundCapture(captureId: string, bountyId: string): Promise<{ id: string; status: string }> {
  const { payments } = sdk(requirePayPal());
  const { result } = await payments.refundCapturedPayment({
    captureId,
    paypalRequestId: `bounty-refund-${bountyId}`,
    prefer: "return=minimal",
    body: { noteToPayer: "PORT4LLEO fix bounty cancelled before anyone claimed it." },
  });
  if (!result.id) throw new Error("PayPal did not return a refund id");
  return { id: result.id, status: String(result.status ?? "") };
}

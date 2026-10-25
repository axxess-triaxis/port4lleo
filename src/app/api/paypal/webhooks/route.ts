import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/paypal/rest";
import { paypalConfig } from "@/lib/paypal/config";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/paypal/webhooks -- PayPal event notifications, verified by PayPal's own
 * verify-webhook-signature API before anything is read. Used to keep payout status current
 * (a payout can be PENDING/UNCLAIMED for a while after approval) and to log every event.
 */

interface PayPalEvent {
  id: string;
  event_type: string;
  resource?: {
    payout_batch_id?: string;
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    transaction_status?: string;
    payout_item?: { sender_item_id?: string };
  };
}

export async function POST(request: NextRequest) {
  if (!paypalConfig()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const raw = await request.text();
  if (!(await verifyWebhookSignature(request.headers, raw))) {
    console.warn("paypal webhook rejected", JSON.stringify({ transmissionId: request.headers.get("paypal-transmission-id") }));
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as PayPalEvent;
  const admin = createAdminClient();

  // Payout item events carry our bounty id as sender_item_id; batch events carry the batch id.
  const bountyId = event.resource?.payout_item?.sender_item_id ?? null;
  const batchId = event.resource?.payout_batch_id ?? event.resource?.batch_header?.payout_batch_id ?? null;
  const status = event.resource?.transaction_status ?? event.resource?.batch_header?.batch_status ?? null;

  if (event.event_type.startsWith("PAYMENT.PAYOUTS") && status && (bountyId || batchId)) {
    const q = admin.from("bounties").update({ payout_status: status, updated_at: new Date().toISOString() });
    const { data } = await (bountyId ? q.eq("id", bountyId) : q.eq("payout_batch_id", batchId!)).eq("status", "paid").select("id");
    for (const b of data ?? []) {
      await admin.from("bounty_events").insert({ bounty_id: b.id, kind: "paypal_webhook", detail: { eventId: event.id, type: event.event_type, status } });
    }
  }
  return NextResponse.json({ ok: true });
}

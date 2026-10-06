import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  approveBounty,
  cancelBounty,
  claimBounty,
  completeFunding,
  getBounty,
  rejectClaim,
  startFunding,
  toPublic,
  verifyBounty,
} from "@/lib/bounties/service";
import { currentViewer, errorResponse } from "@/lib/bounties/viewer";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Verification runs the agent (several Groq + GitHub + PayPal calls).
export const maxDuration = 120;

const Id = z.string().uuid();

/**
 * POST /api/bounties/<id>/<action>
 *   order    -> create the PayPal order (funder)            {}            => {orderId}
 *   capture  -> capture after PayPal approval (funder)      {orderId}
 *   claim    -> claim with the fixing PR (any other user)   {prUrl, paypalEmail}
 *   verify   -> hard checks + AI agent (claimant/funder/admin)
 *   approve  -> pay out via PayPal Payouts (repo admin, not the claimant)
 *   reject   -> reopen the bounty (repo admin)              {reason}
 *   cancel   -> refund an unclaimed bounty (funder)
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/bounties/[id]/[action]">) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id, action } = await params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
  const admin = createAdminClient();
  const viewer = await currentViewer(admin);
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

  try {
    switch (action) {
      case "order":
        return NextResponse.json(await startFunding(admin, viewer, id));
      case "capture": {
        const orderId = z.string().min(5).max(64).safeParse(body.orderId);
        if (!orderId.success) return NextResponse.json({ error: "orderId required" }, { status: 400 });
        return NextResponse.json({ bounty: toPublic(await completeFunding(admin, viewer, id, orderId.data), viewer) });
      }
      case "claim": {
        const parsed = z.object({ prUrl: z.string().max(300), paypalEmail: z.string().max(254) }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "prUrl and paypalEmail required" }, { status: 400 });
        return NextResponse.json({ bounty: toPublic(await claimBounty(admin, viewer, id, parsed.data), viewer) });
      }
      case "verify":
        return NextResponse.json({ bounty: toPublic(await verifyBounty(admin, viewer, id), viewer) });
      case "approve":
        return NextResponse.json({ bounty: toPublic(await approveBounty(admin, viewer, id), viewer) });
      case "reject":
        return NextResponse.json({ bounty: toPublic(await rejectClaim(admin, viewer, id, String(body.reason ?? "")), viewer) });
      case "cancel":
        return NextResponse.json({ bounty: toPublic(await cancelBounty(admin, viewer, id), viewer) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/bounties/<id>/details -- one bounty (private repos need GitHub access). */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/bounties/[id]/[action]">) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id, action } = await params;
  if (action !== "details" || !Id.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createAdminClient();
  const viewer = await currentViewer(admin);
  try {
    return NextResponse.json({ bounty: toPublic(await getBounty(admin, viewer, id), viewer) });
  } catch (e) {
    return errorResponse(e);
  }
}

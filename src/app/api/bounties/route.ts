import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { bountiesForUser, createBounty, toPublic } from "@/lib/bounties/service";
import { currentViewer, errorResponse } from "@/lib/bounties/viewer";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

const CreateBody = z.object({
  installationId: z.number().int().positive(),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  alertNumber: z.number().int().positive(),
  amount: z.union([z.string(), z.number()]),
});

/** GET /api/bounties -- bounties the viewer funded or claimed. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const viewer = await currentViewer(admin);
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rows = await bountiesForUser(admin, viewer.userId);
  return NextResponse.json({ bounties: rows.map((r) => toPublic(r, viewer)) });
}

/** POST /api/bounties {installationId, repo, alertNumber, amount} -- create a draft bounty. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const viewer = await currentViewer(admin);
  if (!viewer) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "installationId, repo, alertNumber and amount are required" }, { status: 400 });
  try {
    return NextResponse.json({ bounty: toPublic(await createBounty(admin, viewer, parsed.data), viewer) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { bountiesForPlugin } from "@/lib/bounties/pluginView";
import { getUserAccessToken } from "@/lib/github/userToken";
import { authenticatePluginRequest } from "@/lib/plugin/auth";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * GET /api/plugin/bounties -- read-only fix bounties on repos the token owner can access,
 * checked live against GitHub (Claude plugin). There is no plugin route that funds, claims or pays.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const auth = await authenticatePluginRequest(admin, request);
  if (!auth.ok) return auth.response;

  let token: string;
  try {
    token = await getUserAccessToken(admin, auth.userId);
  } catch {
    return NextResponse.json({ error: "Your GitHub sign-in on PORT4LLEO has expired. Sign in on the website again." }, { status: 409 });
  }

  try {
    const out = await bountiesForPlugin(admin, { userId: auth.userId, token }, request.nextUrl.origin);
    return NextResponse.json({
      ...out,
      note: "Read-only. Funding, claiming, approval and payment happen on the PORT4LLEO website, with a human approving every payout.",
    });
  } catch (e) {
    console.error("plugin bounties failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check your repository access on GitHub; try again." }, { status: 502 });
  }
}

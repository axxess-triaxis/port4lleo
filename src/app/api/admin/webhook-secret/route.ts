import { NextResponse, type NextRequest } from "next/server";
import { isAdminLogin } from "@/lib/admin";
import { syncAppWebhookConfig } from "@/lib/github/appWebhook";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * POST /api/admin/webhook-secret -- operator-only. Sets the GitHub App's webhook URL
 * and secret from this deployment's GITHUB_WEBHOOK_SECRET, so GitHub and the server
 * can't disagree. Responds with the URL GitHub now has; never with the secret.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("login").eq("id", user.id).single();
  // 404, not 403: don't advertise that an admin endpoint exists.
  if (!isAdminLogin(profile?.login)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "GITHUB_WEBHOOK_SECRET is not set" }, { status: 500 });

  try {
    const cfg = await syncAppWebhookConfig({ url: `${request.nextUrl.origin}/api/github/webhooks`, secret });
    console.info("webhook config synced", JSON.stringify({ by: profile?.login, url: cfg.url }));
    return NextResponse.json({ ok: true, ...cfg });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}

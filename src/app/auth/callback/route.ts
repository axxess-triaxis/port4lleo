import { after, NextResponse, type NextRequest } from "next/server";
import { encrypt } from "@/lib/crypto";
import { upsertInstallations, viewerInstallations } from "@/lib/installations";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

/** GitHub App user tokens last 8 h. Supabase doesn't pass the expiry through, so assume it. */
const USER_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?error=missing-code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/?error=exchange`);

  const { user, provider_token: providerToken, provider_refresh_token: refreshToken } = data.session;
  const login = (user.user_metadata.user_name ?? user.user_metadata.preferred_username) as string | undefined;
  if (!providerToken || !login) return NextResponse.redirect(`${origin}/?error=no-github-token`);

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("last_synced_at").eq("id", user.id).maybeSingle();

  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id,
    login,
    name: user.user_metadata.full_name ?? null,
    avatar_url: user.user_metadata.avatar_url ?? null,
  });
  if (pErr) return NextResponse.redirect(`${origin}/?error=profile`);

  await admin.from("github_tokens").upsert({
    user_id: user.id,
    ciphertext: encrypt(providerToken),
    refresh_ciphertext: refreshToken ? encrypt(refreshToken) : null,
    // Only meaningful with a refresh token (expiring tokens enabled on the App).
    expires_at: refreshToken ? new Date(Date.now() + USER_TOKEN_TTL_MS).toISOString() : null,
    scopes: null,
    updated_at: new Date().toISOString(),
  });

  // Record installations this user can see (covers any webhook we might have missed).
  await viewerInstallations(providerToken)
    .then((list) => upsertInstallations(admin, list))
    .catch((e) => console.error("installation refresh failed", e));

  if (!existing?.last_synced_at) {
    after(() => syncUser(admin, user.id).catch((e) => console.error("initial sync failed", e)));
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}

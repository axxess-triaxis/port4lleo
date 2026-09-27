import { after, NextResponse, type NextRequest } from "next/server";
import { encrypt } from "@/lib/crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?error=missing-code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/?error=exchange`);

  const { user, provider_token: providerToken } = data.session;
  const login = (user.user_metadata.user_name ?? user.user_metadata.preferred_username) as string | undefined;
  if (!providerToken || !login) return NextResponse.redirect(`${origin}/?error=no-github-token`);

  const includePrivate = request.nextUrl.searchParams.get("private") === "1";
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("last_synced_at").eq("id", user.id).maybeSingle();

  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id,
    login,
    name: user.user_metadata.full_name ?? null,
    avatar_url: user.user_metadata.avatar_url ?? null,
    // Scope must match the token actually granted in this sign-in.
    include_private: includePrivate,
  });
  if (pErr) return NextResponse.redirect(`${origin}/?error=profile`);

  await admin.from("github_tokens").upsert({
    user_id: user.id,
    ciphertext: encrypt(providerToken),
    scopes: includePrivate ? "read:user read:project repo" : "read:user read:project",
    updated_at: new Date().toISOString(),
  });

  // First sign-in (or scope change): build the portfolio in the background.
  if (!existing?.last_synced_at || includePrivate) {
    after(() => syncUser(admin, user.id).catch((e) => console.error("initial sync failed", e)));
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}

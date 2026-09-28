import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * GitHub App user tokens expire after 8 h and come with a 6-month refresh token.
 * Returns a valid access token for the user, refreshing (and re-storing) when needed.
 */

const REFRESH_MARGIN_MS = 5 * 60_000;

export interface TokenRow {
  ciphertext: string;
  refresh_ciphertext: string | null;
  expires_at: string | null;
}

export interface RefreshedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export function needsRefresh(row: TokenRow, now = Date.now()): boolean {
  return !!row.expires_at && !!row.refresh_ciphertext && new Date(row.expires_at).getTime() - now < REFRESH_MARGIN_MS;
}

export async function refreshUserToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<RefreshedToken> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET not set");
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  // GitHub returns 200 with an `error` field on failure.
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`GitHub token refresh failed: ${body.error_description ?? body.error ?? res.status} -- sign in again`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
  };
}

export async function getUserAccessToken(admin: SupabaseClient, userId: string): Promise<string> {
  const { data: row } = await admin
    .from("github_tokens")
    .select("ciphertext, refresh_ciphertext, expires_at")
    .eq("user_id", userId)
    .single<TokenRow>();
  if (!row) throw new Error("No GitHub token on file -- sign in again");
  if (!needsRefresh(row)) return decrypt(row.ciphertext);

  const fresh = await refreshUserToken(decrypt(row.refresh_ciphertext!));
  await admin
    .from("github_tokens")
    .update({
      ciphertext: encrypt(fresh.accessToken),
      refresh_ciphertext: fresh.refreshToken ? encrypt(fresh.refreshToken) : row.refresh_ciphertext,
      expires_at: fresh.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return fresh.accessToken;
}

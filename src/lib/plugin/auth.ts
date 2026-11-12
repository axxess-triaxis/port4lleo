import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { bearerToken, hashPluginToken, PLUGIN_RATE_LIMIT } from "./tokens";

export type PluginAuth = { ok: true; userId: string } | { ok: false; response: NextResponse };

const UNAUTHORIZED = {
  error: "Missing, invalid or revoked plugin token. Create one on your PORT4LLEO dashboard.",
};

/**
 * Authorizes a /api/plugin request by its bearer token and counts it against the token's
 * rate limit. Only the token's hash is ever sent to the database.
 */
export async function authenticatePluginRequest(admin: SupabaseClient, request: Request): Promise<PluginAuth> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };

  const { data, error } = await admin
    .rpc("use_plugin_token", {
      p_hash: hashPluginToken(token),
      p_limit: PLUGIN_RATE_LIMIT.limit,
      p_window_seconds: PLUGIN_RATE_LIMIT.windowSeconds,
    })
    .maybeSingle<{ user_id: string; allowed: boolean; retry_after_seconds: number }>();
  if (error) {
    console.error("plugin token lookup failed", error.message);
    return { ok: false, response: NextResponse.json({ error: "Token check failed; try again." }, { status: 500 }) };
  }
  if (!data) return { ok: false, response: NextResponse.json(UNAUTHORIZED, { status: 401 }) };
  if (!data.allowed) {
    const retry = Math.max(1, data.retry_after_seconds);
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Rate limit reached (${PLUGIN_RATE_LIMIT.limit} requests per ${PLUGIN_RATE_LIMIT.windowSeconds / 60} min). Try again in ${Math.ceil(retry / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(retry) } },
      ),
    };
  }
  return { ok: true, userId: data.user_id };
}

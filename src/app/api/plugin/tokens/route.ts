import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { generatePluginToken, MAX_ACTIVE_PLUGIN_TOKENS } from "@/lib/plugin/tokens";
import { createAdminClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

async function signedInUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** POST /api/plugin/tokens -- create a Claude plugin token. The token is returned this once only. */
export async function POST() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("plugin_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("revoked", false);
  if ((count ?? 0) >= MAX_ACTIVE_PLUGIN_TOKENS) {
    return NextResponse.json({ error: `You already have ${MAX_ACTIVE_PLUGIN_TOKENS} active tokens. Revoke one first.` }, { status: 409 });
  }

  const { token, hash, last4 } = generatePluginToken();
  const { data, error } = await admin
    .from("plugin_tokens")
    .insert({ user_id: userId, token_hash: hash, last4 })
    .select("id, last4, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not create a token" }, { status: 500 });
  return NextResponse.json({ token, id: data.id, last4: data.last4, createdAt: data.created_at }, { status: 201 });
}

/** DELETE /api/plugin/tokens {id} -- revoke one of the signed-in user's plugin tokens. */
export async function DELETE(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const userId = await signedInUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("plugin_tokens")
    .update({ revoked: true })
    .eq("id", parsed.data.id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not revoke the token" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

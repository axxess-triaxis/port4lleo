import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getUserAccessToken } from "@/lib/github/userToken";
import { createClient } from "@/lib/supabase/server";
import { BountyError, type Viewer } from "./service";

/** The signed-in viewer with their login and live GitHub user token, or null. */
export async function currentViewer(admin: SupabaseClient): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await admin.from("profiles").select("login").eq("id", user.id).maybeSingle<{ login: string }>();
  if (!profile) return null;
  try {
    return { userId: user.id, login: profile.login, token: await getUserAccessToken(admin, user.id) };
  } catch {
    return null;
  }
}

/** Maps errors to JSON responses; unexpected errors are logged and returned without internals. */
export function errorResponse(e: unknown) {
  if (e instanceof BountyError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("bounty route failed", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Something went wrong; nothing was charged or paid twice. Try again." }, { status: 500 });
}

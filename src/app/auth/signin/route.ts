import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * GET /auth/signin[?private=1]
 * Default scopes read public data only. `private=1` adds `repo`, which GitHub
 * only offers as full read/write -- the UI says so before linking here.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!isSupabaseConfigured()) return NextResponse.redirect(`${origin}/?error=not-configured`);

  const includePrivate = request.nextUrl.searchParams.get("private") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback${includePrivate ? "?private=1" : ""}`,
      scopes: includePrivate ? "read:user read:project repo" : "read:user read:project",
    },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/?error=oauth`);
  return NextResponse.redirect(data.url);
}

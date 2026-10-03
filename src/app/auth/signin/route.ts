import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * GET /auth/signin -- sign in with the PORT4LLEO GitHub App (Supabase's GitHub provider
 * configured with the App's client id/secret). GitHub Apps have no OAuth scopes: what
 * the token can read is the App's read-only permissions, limited to public data plus
 * any repos the user installed the App on.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!isSupabaseConfigured()) return NextResponse.redirect(`${origin}/?error=not-configured`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/?error=oauth`);
  return NextResponse.redirect(data.url);
}

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { parseOverridesYaml } from "@/lib/overrides/overrides";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/** PUT /api/overrides -- body: portfolio.yml-format text. Validated, then stored for the signed-in user. */
export async function PUT(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const text = await request.text();
  if (text.length > 50_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const parsed = parseOverridesYaml(text);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await supabase
    .from("overrides")
    .upsert({ user_id: user.id, data: parsed.value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase.from("profiles").select("login").eq("id", user.id).single();
  if (profile) revalidatePath(`/u/${profile.login}`);
  return NextResponse.json({ ok: true, overrides: parsed.value });
}

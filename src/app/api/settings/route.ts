import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { createAdminClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const body = z.object({
  isPublic: z.boolean().optional(),
  /** string = set, null = remove. Omitted = unchanged. */
  vercelToken: z.string().trim().min(10).max(200).nullable().optional(),
});

/** PATCH /api/settings -- portfolio visibility and the optional Vercel token. */
export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { isPublic, vercelToken } = parsed.data;

  if (isPublic !== undefined) {
    const { error } = await supabase.from("profiles").update({ is_public: isPublic }).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (vercelToken !== undefined) {
    const admin = createAdminClient();
    const { error } =
      vercelToken === null
        ? await admin.from("vercel_tokens").delete().eq("user_id", user.id)
        : await admin
            .from("vercel_tokens")
            .upsert({ user_id: user.id, ciphertext: encrypt(vercelToken), updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: profile } = await supabase.from("profiles").select("login").eq("id", user.id).single();
  if (profile) revalidatePath(`/u/${profile.login}`);
  return NextResponse.json({ ok: true });
}

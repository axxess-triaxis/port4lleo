import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { WebhookSyncButton } from "@/components/WebhookSyncButton";
import { isAdminLogin } from "@/lib/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/?error=not-configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("login").eq("id", user.id).single();
  if (!isAdminLogin(profile?.login)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Operator tools</h1>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">GitHub App webhook</h2>
        <p className="text-sm text-ink-2">
          Sets the GitHub App&apos;s webhook URL and secret from this deployment&apos;s <code>GITHUB_WEBHOOK_SECRET</code>,
          through GitHub&apos;s API. Use it after changing that variable in Vercel (and redeploying), instead of pasting the
          secret into GitHub by hand. The secret is never shown.
        </p>
        <WebhookSyncButton />
      </section>
    </div>
  );
}

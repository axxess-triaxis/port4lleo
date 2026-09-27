import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { stringify } from "yaml";
import { DashboardControls } from "@/components/DashboardControls";
import { PortfolioView } from "@/components/PortfolioView";
import { getPortfolioByUserId } from "@/lib/portfolio";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await connection(); // always per-request, even when the build has no Supabase env
  if (!isSupabaseConfigured()) redirect("/?error=not-configured");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("login, is_public, include_private, last_synced_at")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/auth/signin");

  const portfolio = await getPortfolioByUserId(user.id, profile.is_public);
  const hasOverrides =
    portfolio &&
    (portfolio.overrides.apps.length ||
      portfolio.overrides.hackathons.length ||
      portfolio.overrides.prototypes.length ||
      portfolio.overrides.exclude.length);

  return (
    <>
      <DashboardControls
        login={profile.login}
        isPublic={profile.is_public}
        includePrivate={profile.include_private}
        lastSyncedAt={profile.last_synced_at}
        overridesYaml={hasOverrides ? stringify(portfolio.overrides) : ""}
      />
      {portfolio ? (
        <PortfolioView p={portfolio} />
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-ink-2">
          Your first sync is running. It usually takes under a minute. Refresh this page, or press “Sync now”.
        </div>
      )}
    </>
  );
}

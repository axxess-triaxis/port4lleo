import { after, NextResponse, type NextRequest } from "next/server";
import { verifySignature } from "@/lib/github/webhook";
import { auditInstallation } from "@/lib/governance/service";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

interface InstallationPayload {
  action: string;
  installation: { id: number; account: { login: string; type: string }; repository_selection?: string };
}

interface MarketplacePayload {
  action: string;
  marketplace_purchase: { account: { login: string; type: string }; plan: { name: string } };
}

/** POST /api/github/webhooks -- GitHub App + Marketplace events. Signature-verified. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const admin = createAdminClient();

  if (event === "ping") return NextResponse.json({ ok: true });

  if (event === "installation" || event === "installation_repositories") {
    const { action, installation } = payload as unknown as InstallationPayload;
    if (event === "installation" && action === "deleted") {
      // Uninstall removes the installation and (by cascade) every stored audit.
      await admin.from("installations").delete().eq("id", installation.id);
      return NextResponse.json({ ok: true });
    }
    await admin.from("installations").upsert({
      id: installation.id,
      account_login: installation.account.login,
      account_type: installation.account.type,
      repository_selection: installation.repository_selection ?? null,
      suspended_at: action === "suspend" ? new Date().toISOString() : null,
    });
    if (action === "created" || (event === "installation_repositories" && action === "added")) {
      after(() => auditInstallation(admin, installation.id).catch((e) => console.error("webhook audit failed", e)));
    }
    return NextResponse.json({ ok: true });
  }

  if (event === "marketplace_purchase") {
    const { action, marketplace_purchase: mp } = payload as unknown as MarketplacePayload;
    await admin.from("marketplace_events").insert({
      action,
      account_login: mp?.account?.login ?? null,
      account_type: mp?.account?.type ?? null,
      plan_name: mp?.plan?.name ?? null,
      payload,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event });
}

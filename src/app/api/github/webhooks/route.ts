import { after, NextResponse, type NextRequest } from "next/server";
import { diagnoseSignature, matchWebhookSource, verifySignature } from "@/lib/github/webhook";
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
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");
  const secrets = { app: process.env.GITHUB_WEBHOOK_SECRET, marketplace: process.env.MARKETPLACE_WEBHOOK_SECRET };
  const source = matchWebhookSource(raw, signature, event, secrets);
  const meta = {
    event,
    delivery: request.headers.get("x-github-delivery"),
    hookId: request.headers.get("x-github-hook-id"),
    target: request.headers.get("x-github-hook-installation-target-type"),
  };
  if (!source) {
    const app = diagnoseSignature(raw, signature, secrets.app);
    const marketplace = diagnoseSignature(raw, signature, secrets.marketplace);
    console.warn(
      "webhook rejected",
      JSON.stringify({
        ...meta,
        ...app,
        marketplaceSecretConfigured: marketplace.secretConfigured,
        marketplaceSecretLength: marketplace.secretLength,
        marketplaceSecretFingerprint: marketplace.secretFingerprint,
        // True when the Marketplace secret did sign it but the event isn't a Marketplace event.
        marketplaceSignedWrongEvent: verifySignature(raw, signature, secrets.marketplace),
      }),
    );
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  console.info("webhook accepted", JSON.stringify({ ...meta, source }));
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

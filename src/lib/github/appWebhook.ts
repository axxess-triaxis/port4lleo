import "server-only";
import { appConfig, appJwt } from "./app";
import { GitHubError } from "./client";

/**
 * Point the GitHub App's webhook at `url` and set its secret to `secret`, via
 * PATCH /app/hook/config (authenticated as the App itself). Used so the secret GitHub
 * signs with and the one this server verifies with are the same value by construction,
 * with no copy-paste between dashboards. GitHub never returns the secret back.
 */
export async function syncAppWebhookConfig(
  opts: { url: string; secret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; contentType: string }> {
  const secret = opts.secret.trim();
  if (secret.length < 32) throw new Error("Refusing to set a webhook secret shorter than 32 characters");
  const { appId, key } = appConfig();
  const res = await fetchImpl("https://api.github.com/app/hook/config", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${appJwt(appId, key)}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "port4lleo",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: opts.url, content_type: "json", insecure_ssl: "0", secret }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubError(`PATCH /app/hook/config -> ${res.status}${body?.message ? `: ${body.message}` : ""}`, res.status);
  }
  const cfg = (await res.json()) as { url: string; content_type: string };
  return { url: cfg.url, contentType: cfg.content_type };
}

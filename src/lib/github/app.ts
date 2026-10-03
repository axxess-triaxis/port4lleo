import "server-only";
import { createSign } from "node:crypto";
import { createGitHubClient, GitHubError, type GitHubClient } from "./client";

/**
 * GitHub App server-side auth: app JWT (RS256, signed with GITHUB_APP_PRIVATE_KEY)
 * -> installation access token (1 h), cached in memory until 5 min before expiry.
 */

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function appJwt(appId: string, privateKeyPem: string, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat backdated 60 s for clock drift; GitHub allows exp at most 10 min out.
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKeyPem).toString("base64url")}`;
}

export function appConfig() {
  const appId = process.env.GITHUB_APP_ID;
  // Env stores often flatten newlines; accept literal "\n" as well as real ones.
  const key = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !key) throw new Error("GitHub App is not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY)");
  return { appId, key };
}

const cache = new Map<number, { token: string; expiresAt: number }>();

export async function installationToken(installationId: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const hit = cache.get(installationId);
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const { appId, key } = appConfig();
  const res = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt(appId, key)}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "port4lleo",
    },
  });
  if (!res.ok) throw new GitHubError(`Installation token for ${installationId} -> ${res.status}`, res.status);
  const body = (await res.json()) as { token: string; expires_at: string };
  cache.set(installationId, { token: body.token, expiresAt: new Date(body.expires_at).getTime() });
  return body.token;
}

export async function installationClient(installationId: number): Promise<GitHubClient> {
  return createGitHubClient(await installationToken(installationId));
}

export function installUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

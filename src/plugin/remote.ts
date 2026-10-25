/**
 * Client for the PORT4LLEO website's /api/plugin routes: the optional "linked account" half
 * of the plugin. Read-only apart from asking the server to re-sync; it never sends metrics,
 * and never funds, claims or pays anything (bounties are listed, not acted on).
 *
 * Config: PORT4LLEO_TOKEN (a p4l_ token from the dashboard) and PORT4LLEO_URL (optional).
 * Inside Claude Code these come from the plugin's userConfig, passed to the MCP server's env.
 */

export const DEFAULT_BASE_URL = "https://port4leo-sigma.vercel.app";
const TOKEN_RE = /^p4l_[A-Za-z0-9_-]{43}$/;

export const REMOTE_ACTIONS = {
  portfolio: { method: "GET", path: "/api/plugin/portfolio", timeoutMs: 30_000 },
  resync: { method: "POST", path: "/api/plugin/resync", timeoutMs: 310_000 },
  bounties: { method: "GET", path: "/api/plugin/bounties", timeoutMs: 70_000 },
} as const;
export type RemoteAction = keyof typeof REMOTE_ACTIONS;

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export const NOT_LINKED =
  "Not linked to a PORT4LLEO account. Create a token on your PORT4LLEO dashboard (\"Claude plugin: link your account\") " +
  "and set it as this plugin's api_token option, or as PORT4LLEO_TOKEN when running the script directly.";

export interface RemoteConfig {
  token: string;
  baseUrl: string;
}

/** An unset optional userConfig value can arrive empty or as its literal placeholder. */
function setting(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t && !t.includes("${") ? t : undefined;
}

export function remoteConfig(env: Record<string, string | undefined> = process.env): RemoteConfig {
  const token = setting(env.PORT4LLEO_TOKEN);
  if (!token) throw new RemoteError(NOT_LINKED);
  if (!TOKEN_RE.test(token)) throw new RemoteError("The PORT4LLEO token is malformed: it should start with p4l_. Copy it again from the dashboard.");

  const raw = setting(env.PORT4LLEO_URL) ?? DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteError(`PORT4LLEO base URL is not a URL: ${raw}`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  // The token is a bearer credential: never send it in clear over the network.
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new RemoteError(`PORT4LLEO base URL must use https: ${url.origin}`);
  }
  return { token, baseUrl: url.origin };
}

export async function remoteCall(action: RemoteAction, cfg: RemoteConfig, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const { method, path, timeoutMs } = REMOTE_ACTIONS[action];
  let res: Response;
  try {
    res = await fetchImpl(cfg.baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new RemoteError(`Could not reach ${cfg.baseUrl}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
    const retry = res.headers.get("retry-after");
    throw new RemoteError(retry ? `${msg} (retry after ${retry}s)` : msg, res.status);
  }
  return body;
}

/** One line for the terminal / tool result. */
export function remoteHeadline(action: RemoteAction, out: unknown): string {
  const o = (out ?? {}) as Record<string, unknown>;
  switch (action) {
    case "portfolio":
      return o.score === null || o.score === undefined
        ? `${o.login}: no stored score yet`
        : `${o.login}: ${o.score} (${o.tier}), last synced ${o.lastSyncedAt ?? "never"}`;
    case "resync":
      return `${o.login}: re-synced, ${o.score} (${o.tier})`;
    case "bounties": {
      const list = Array.isArray(o.bounties) ? o.bounties : [];
      return `${list.length} live bount${list.length === 1 ? "y" : "ies"} across ${o.reposChecked ?? 0} accessible repos plus the public board`;
    }
  }
}

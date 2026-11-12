import { createHash, randomBytes } from "node:crypto";

/**
 * Plugin tokens: "p4l_" + 32 random bytes (base64url). Only the SHA-256 hash and the last
 * four characters are stored; the token is shown to its owner once.
 */

export const PLUGIN_TOKEN_PREFIX = "p4l_";
const TOKEN_RE = /^p4l_[A-Za-z0-9_-]{43}$/;

/** At most this many unrevoked tokens per user. */
export const MAX_ACTIVE_PLUGIN_TOKENS = 5;

/** Requests per token per window, shared across the /api/plugin routes. */
export const PLUGIN_RATE_LIMIT = { limit: 30, windowSeconds: 600 };

export function generatePluginToken(): { token: string; hash: string; last4: string } {
  const token = PLUGIN_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashPluginToken(token), last4: token.slice(-4) };
}

export function hashPluginToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedPluginToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m && isWellFormedPluginToken(m[1]) ? m[1] : null;
}

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { authenticatePluginRequest } from "@/lib/plugin/auth";
import { bearerToken, generatePluginToken, hashPluginToken, isWellFormedPluginToken, PLUGIN_RATE_LIMIT } from "@/lib/plugin/tokens";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("plugin tokens", () => {
  it("are p4l_ + 256 random bits, stored as SHA-256 hex plus the last four characters", () => {
    const a = generatePluginToken();
    const b = generatePluginToken();
    expect(a.token).toMatch(/^p4l_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(createHash("sha256").update(a.token).digest("hex"));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token.slice(4));
    expect(a.last4).toBe(a.token.slice(-4));
    expect(isWellFormedPluginToken(a.token)).toBe(true);
  });

  it("hashing is deterministic", () => {
    const { token, hash } = generatePluginToken();
    expect(hashPluginToken(token)).toBe(hash);
  });

  it("reads only well-formed bearer tokens", () => {
    const { token } = generatePluginToken();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer ${token}`)).toBe(token);
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(token)).toBeNull();
    expect(bearerToken("Bearer ghp_abcdef")).toBeNull();
    expect(bearerToken(`Bearer ${token}x`)).toBeNull();
    expect(bearerToken(`Basic ${token}`)).toBeNull();
  });
});

function fakeAdmin(result: { data: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(() => ({ maybeSingle: async () => ({ data: result.data, error: result.error ?? null }) }));
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

const req = (auth?: string) => new Request("https://x.test/api/plugin/portfolio", { headers: auth ? { authorization: auth } : {} });

describe("authenticatePluginRequest", () => {
  it("rejects a missing or malformed token without touching the database", async () => {
    const { admin, rpc } = fakeAdmin({ data: null });
    for (const h of [undefined, "Bearer nope"]) {
      const out = await authenticatePluginRequest(admin, req(h));
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.response.status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends only the hash, with the shared rate limit, and returns the owner", async () => {
    const { token, hash } = generatePluginToken();
    const { admin, rpc } = fakeAdmin({ data: { user_id: "u1", allowed: true, retry_after_seconds: 0 } });
    const out = await authenticatePluginRequest(admin, req(`Bearer ${token}`));
    expect(out).toEqual({ ok: true, userId: "u1" });
    expect(rpc).toHaveBeenCalledWith("use_plugin_token", {
      p_hash: hash,
      p_limit: PLUGIN_RATE_LIMIT.limit,
      p_window_seconds: PLUGIN_RATE_LIMIT.windowSeconds,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
  });

  it("401s an unknown or revoked token", async () => {
    const { admin } = fakeAdmin({ data: null });
    const out = await authenticatePluginRequest(admin, req(`Bearer ${generatePluginToken().token}`));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.response.status).toBe(401);
  });

  it("429s with Retry-After once the window is used up", async () => {
    const { admin } = fakeAdmin({ data: { user_id: "u1", allowed: false, retry_after_seconds: 125 } });
    const out = await authenticatePluginRequest(admin, req(`Bearer ${generatePluginToken().token}`));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(429);
      expect(out.response.headers.get("retry-after")).toBe("125");
    }
  });

  it("fails closed on a database error", async () => {
    const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await authenticatePluginRequest(admin, req(`Bearer ${generatePluginToken().token}`));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.response.status).toBe(500);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { needsRefresh, refreshUserToken } from "@/lib/github/userToken";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const row = (expires: string | null, refresh: string | null = "enc") => ({ ciphertext: "c", refresh_ciphertext: refresh, expires_at: expires });

describe("needsRefresh", () => {
  it("refreshes within 5 minutes of expiry, not before", () => {
    expect(needsRefresh(row("2026-09-28T12:04:00Z"), NOW)).toBe(true);
    expect(needsRefresh(row("2026-09-28T11:00:00Z"), NOW)).toBe(true);
    expect(needsRefresh(row("2026-09-28T13:00:00Z"), NOW)).toBe(false);
  });
  it("never refreshes non-expiring tokens or rows without a refresh token", () => {
    expect(needsRefresh(row(null), NOW)).toBe(false);
    expect(needsRefresh(row("2026-09-28T11:00:00Z", null), NOW)).toBe(false);
  });
});

describe("refreshUserToken", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exchanges the refresh token and returns the new pair with expiry", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.x");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "s");
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ grant_type: "refresh_token", refresh_token: "r1", client_id: "Iv1.x" });
      return Response.json({ access_token: "a2", refresh_token: "r2", expires_in: 28800 });
    });
    const t = await refreshUserToken("r1", fetchImpl as typeof fetch);
    expect(t.accessToken).toBe("a2");
    expect(t.refreshToken).toBe("r2");
    expect(new Date(t.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 28_000_000);
  });

  it("surfaces GitHub's 200-with-error responses as failures", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.x");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "s");
    const fetchImpl = vi.fn(async () => Response.json({ error: "bad_refresh_token", error_description: "The refresh token passed is incorrect or expired." }));
    await expect(refreshUserToken("r1", fetchImpl as typeof fetch)).rejects.toThrow(/incorrect or expired.*sign in again/);
  });

  it("requires the App credentials", async () => {
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "");
    await expect(refreshUserToken("r1", vi.fn() as typeof fetch)).rejects.toThrow(/not set/);
  });
});

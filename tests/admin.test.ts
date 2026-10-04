import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isAdminLogin } from "@/lib/admin";
import { syncAppWebhookConfig } from "@/lib/github/appWebhook";

describe("isAdminLogin", () => {
  it("is off unless ADMIN_GITHUB_LOGINS lists the login (case-insensitive)", () => {
    expect(isAdminLogin("axxess-triaxis", undefined)).toBe(false);
    expect(isAdminLogin("axxess-triaxis", "")).toBe(false);
    expect(isAdminLogin("Axxess-Triaxis", " axxess-triaxis , other ")).toBe(true);
    expect(isAdminLogin("someone-else", "axxess-triaxis")).toBe(false);
    expect(isAdminLogin(null, "axxess-triaxis")).toBe(false);
  });
});

describe("syncAppWebhookConfig", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  afterEach(() => vi.unstubAllEnvs());

  it("PATCHes /app/hook/config as the App with the url and trimmed secret, and never returns the secret", async () => {
    vi.stubEnv("GITHUB_APP_ID", "5107519");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey.export({ type: "pkcs1", format: "pem" }).toString());
    const secret = "f".repeat(64);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/app/hook/config");
      expect(init?.method).toBe("PATCH");
      const jwt = String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", "");
      const [h, p, sig] = jwt.split(".");
      const v = createVerify("RSA-SHA256");
      v.update(`${h}.${p}`);
      expect(v.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true); // signed by the App key
      expect(JSON.parse(String(init?.body))).toEqual({
        url: "https://example.test/api/github/webhooks",
        content_type: "json",
        insecure_ssl: "0",
        secret,
      });
      return Response.json({ url: "https://example.test/api/github/webhooks", content_type: "json", secret: "********" });
    });
    const out = await syncAppWebhookConfig({ url: "https://example.test/api/github/webhooks", secret: `${secret}\n` }, fetchImpl as typeof fetch);
    expect(out).toEqual({ url: "https://example.test/api/github/webhooks", contentType: "json" });
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it("refuses weak secrets and surfaces GitHub errors", async () => {
    await expect(syncAppWebhookConfig({ url: "u", secret: "short" }, vi.fn() as typeof fetch)).rejects.toThrow(/shorter than 32/);
    vi.stubEnv("GITHUB_APP_ID", "1");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey.export({ type: "pkcs1", format: "pem" }).toString());
    const fetchImpl = vi.fn(async () => Response.json({ message: "A JSON web token could not be decoded" }, { status: 401 }));
    await expect(syncAppWebhookConfig({ url: "u", secret: "a".repeat(64) }, fetchImpl as typeof fetch)).rejects.toThrow(
      /401: A JSON web token could not be decoded/,
    );
  });
});

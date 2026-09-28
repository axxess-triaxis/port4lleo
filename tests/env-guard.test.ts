import { describe, expect, it } from "vitest";
import { findPublicSecrets } from "@/lib/env-guard";

// Built at runtime so no secret-shaped literal sits in the repo for scanners to flag.
const fake = (prefix: string) => prefix + "x".repeat(36);

describe("findPublicSecrets", () => {
  it("flags secret-shaped values in NEXT_PUBLIC_ vars", () => {
    const problems = findPublicSecrets({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fake("sbp_"),
      NEXT_PUBLIC_A: fake("sb_secret_"),
      NEXT_PUBLIC_B: fake("ghp_"),
      NEXT_PUBLIC_C: "-----BEGIN RSA PRIVATE KEY-----\nabc",
    });
    expect(problems).toHaveLength(4);
    expect(problems[0]).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks like a Supabase personal access token");
    expect(problems.join()).not.toContain("xxxx"); // never echoes the value
  });

  it("allows real public keys and ignores server-only vars", () => {
    expect(
      findPublicSecrets({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fake("sb_publishable_"),
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: fake("sb_secret_"),
        GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
      }),
    ).toEqual([]);
  });
});

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

const KEY = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("gho_secret", KEY);
    const b = encrypt("gho_secret", KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe("gho_secret");
  });
  it("rejects tampered ciphertext and wrong keys", () => {
    const c = Buffer.from(encrypt("x", KEY), "base64");
    c[c.length - 1] ^= 1;
    expect(() => decrypt(c.toString("base64"), KEY)).toThrow();
    expect(() => decrypt(encrypt("x", KEY), randomBytes(32).toString("base64"))).toThrow();
  });
  it("requires a 32-byte key", () => {
    expect(() => encrypt("x", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

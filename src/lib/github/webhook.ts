import { createHmac, timingSafeEqual } from "node:crypto";

function matches(rawBody: string, header: string, secret: string): boolean {
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Verifies GitHub's `X-Hub-Signature-256: sha256=<hex>` over the raw body.
 * Surrounding whitespace in the configured secret is ignored: generated secrets never
 * contain it, but pasting into an env var store can add it.
 */
export function verifySignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s || !header?.startsWith("sha256=")) return false;
  return matches(rawBody, header, s);
}

/**
 * Non-secret facts about a rejected delivery, for logs. Never includes the secret or
 * the signature itself -- only shapes, lengths and which check failed.
 */
export function diagnoseSignature(rawBody: string, header: string | null, secret: string | undefined) {
  const raw = secret ?? "";
  return {
    secretConfigured: raw.length > 0,
    secretLength: raw.trim().length,
    secretHadSurroundingWhitespace: raw !== raw.trim(),
    headerPresent: header !== null,
    headerFormatOk: !!header && /^sha256=[0-9a-f]{64}$/.test(header),
    bodyBytes: Buffer.byteLength(rawBody, "utf8"),
  };
}

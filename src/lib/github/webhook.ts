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

/** Which webhook source signed a delivery. */
export type WebhookSource = "app" | "marketplace";

/**
 * Events a Marketplace-listing delivery may carry. The listing's secret is pasted by hand
 * into GitHub's listing form (there is no API for it), so it is kept separate from the
 * API-synced App secret and must never authorize installation or repository events.
 */
const MARKETPLACE_EVENTS = new Set(["marketplace_purchase", "ping"]);

/**
 * Identifies which configured secret signed the delivery, or null if none did.
 * The App secret is checked first. A Marketplace-signed delivery for any event outside
 * MARKETPLACE_EVENTS is treated as unsigned.
 */
export function matchWebhookSource(
  rawBody: string,
  header: string | null,
  event: string | null,
  secrets: { app?: string; marketplace?: string },
): WebhookSource | null {
  if (verifySignature(rawBody, header, secrets.app)) return "app";
  if (verifySignature(rawBody, header, secrets.marketplace) && event !== null && MARKETPLACE_EVENTS.has(event)) {
    return "marketplace";
  }
  return null;
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

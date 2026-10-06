/**
 * PayPal configuration. Sandbox unless BOTH PAYPAL_ENV=live and PAYPAL_ALLOW_LIVE=true:
 * holding and paying out other people's money in production needs PayPal's marketplace
 * (multiparty) onboarding and a compliance review this project has not done, so live mode
 * must never switch on by a single mistyped variable.
 */
export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  live: boolean;
  apiBase: string;
  webhookId: string | null;
}

export function paypalConfig(env: Record<string, string | undefined> = process.env): PayPalConfig | null {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const live = env.PAYPAL_ENV === "live" && env.PAYPAL_ALLOW_LIVE === "true";
  return {
    clientId,
    clientSecret,
    live,
    apiBase: live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || null,
  };
}

export function requirePayPal(env?: Record<string, string | undefined>): PayPalConfig {
  const cfg = paypalConfig(env);
  if (!cfg) throw new Error("PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  return cfg;
}

import "server-only";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import OpenAI from "openai";
import { requirePayPal } from "@/lib/paypal/config";
import type { PayPalToolkitLike } from "./agent";

/**
 * Real dependencies for the verification agent: Groq's free tier through its
 * OpenAI-compatible API (founder decision: free models) and the PayPal Agent Toolkit
 * limited to one read-only action, orders.get.
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_AGENT_MODEL = "openai/gpt-oss-120b";

export function agentDeps(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not set: the verification agent needs it");
  const cfg = requirePayPal(env);
  const paypal = new PayPalAgentToolkit({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    configuration: { actions: { orders: { get: true } }, context: { sandbox: !cfg.live } },
  });
  return {
    llm: new OpenAI({ apiKey, baseURL: GROQ_BASE_URL, maxRetries: 2 }),
    model: env.BOUNTY_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL,
    paypal: paypal as unknown as PayPalToolkitLike,
  };
}

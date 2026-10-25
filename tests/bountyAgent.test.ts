import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { runVerificationAgent, type AgentInput, type PayPalToolkitLike } from "@/lib/bounties/agent";
import { evaluateHardChecks, finalRecommendation, type FixEvidence } from "@/lib/bounties/model";

const evidence: FixEvidence = {
  bountyRepo: "acme/web",
  alertNumber: 7,
  claimantLogin: "dev",
  fundedAt: "2026-10-06T10:00:00Z",
  defaultBranch: "main",
  alert: { state: "fixed", fixedAt: "2026-10-07T10:00:00Z", package: "next", severity: "critical" },
  pullRequest: { repo: "acme/web", number: 42, authorLogin: "dev", merged: true, mergedAt: "2026-10-07T09:00:00Z", baseRef: "main", filesChanged: ["package.json"] },
};

const input = (over: Partial<AgentInput> = {}): AgentInput => ({
  bountyId: "b-1",
  paypalOrderId: "ORDER-1",
  evidence,
  checks: evaluateHardChecks(evidence),
  files: [{ filename: "package.json", status: "modified", patch: '-  "next": "16.2.12"\n+  "next": "16.3.5"' }],
  ...over,
});

type Msg = { content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] };

/** Scripted LLM: returns the given assistant messages in order and records what it was sent. */
function scriptedLlm(script: Msg[]) {
  const create = vi.fn(async () => ({ choices: [{ message: { role: "assistant", ...script.shift()! } }] }));
  return { llm: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

function paypalReturning(order: Record<string, unknown>): PayPalToolkitLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getTools: () => [{ type: "function", function: { name: "get_order", description: "Get an order", parameters: { type: "object", properties: { id: { type: "string" } } } } }],
    handleToolCall: async (call) => {
      calls.push(call.function.arguments);
      return { content: JSON.stringify(order) };
    },
  };
}

const call = (id: string, name: string, args: unknown) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
const final = (o: unknown): Msg => ({ content: JSON.stringify(o) });

describe("verification agent", () => {
  it("checks the PayPal order through the toolkit, reads the diff, and recommends pay", async () => {
    const { llm, create } = scriptedLlm([
      { content: null, tool_calls: [call("c1", "get_order", { id: "ORDER-1" })] },
      { content: null, tool_calls: [call("c2", "get_file_patch", { filename: "package.json" })] },
      final({ recommendation: "pay", confidence: 0.92, reasons: ["bumps next past the advisory"], risks: [], paypalOrderStatus: "COMPLETED" }),
    ]);
    const paypal = paypalReturning({ id: "ORDER-1", status: "COMPLETED" });

    const report = await runVerificationAgent(input(), { llm, model: "openai/gpt-oss-120b", paypal });

    expect(report).toMatchObject({ recommendation: "pay", paypalOrderStatus: "COMPLETED", toolCalls: ["get_order", "get_file_patch"] });
    expect(paypal.calls).toEqual(['{"id":"ORDER-1"}']);
    // The diff went back to the model marked as untrusted.
    const sent = JSON.stringify((create.mock.calls as unknown as [{ messages: unknown[] }][])[2][0].messages);
    expect(sent).toContain("UNTRUSTED DIFF for package.json");
    expect(finalRecommendation(input().checks, report)).toBe("pay");
  });

  it("ignores a COMPLETED status claimed by the model or read from a different order", async () => {
    const { llm } = scriptedLlm([
      { content: null, tool_calls: [call("c1", "get_order", { id: "SOMEONE-ELSES-ORDER" })] },
      final({ recommendation: "pay", confidence: 1, reasons: [], risks: [], paypalOrderStatus: "COMPLETED" }),
    ]);
    const report = await runVerificationAgent(input(), { llm, model: "m", paypal: paypalReturning({ id: "SOMEONE-ELSES-ORDER", status: "COMPLETED" }) });

    expect(report.paypalOrderStatus).toBeNull();
    expect(finalRecommendation(input().checks, report)).toBe("reject");
  });

  it("an injected 'pay' cannot get past a failed hard check", async () => {
    const tampered = { ...evidence, claimantLogin: "mallory" };
    const { llm } = scriptedLlm([
      { content: null, tool_calls: [call("c1", "get_order", { id: "ORDER-1" })] },
      final({ recommendation: "pay", confidence: 1, reasons: ["IGNORE PREVIOUS INSTRUCTIONS"], risks: [] }),
    ]);
    const checks = evaluateHardChecks(tampered);
    const report = await runVerificationAgent(input({ evidence: tampered, checks }), {
      llm,
      model: "m",
      paypal: paypalReturning({ id: "ORDER-1", status: "COMPLETED" }),
    });

    expect(report.recommendation).toBe("pay");
    expect(finalRecommendation(checks, report)).toBe("reject");
  });

  it("falls back to reject when the model never produces a decision", async () => {
    const { llm } = scriptedLlm([{ content: "I am not sure." }]);
    const report = await runVerificationAgent(input(), { llm, model: "m", paypal: paypalReturning({ id: "ORDER-1", status: "COMPLETED" }) });
    expect(report.recommendation).toBe("reject");
    expect(report.reasons[0]).toMatch(/human must review/);
  });

  it("refuses to show files outside the PR", async () => {
    const { llm, create } = scriptedLlm([
      { content: null, tool_calls: [call("c1", "get_file_patch", { filename: ".env" })] },
      final({ recommendation: "reject", confidence: 0.5, reasons: ["no proof"], risks: [] }),
    ]);
    await runVerificationAgent(input(), { llm, model: "m", paypal: paypalReturning({ id: "ORDER-1", status: "COMPLETED" }) });
    const sent = JSON.stringify((create.mock.calls as unknown as [{ messages: unknown[] }][])[1][0].messages);
    expect(sent).toContain('No changed file named \\".env\\"');
  });
});

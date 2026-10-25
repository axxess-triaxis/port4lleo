/**
 * Minimal stdio MCP server (newline-delimited JSON-RPC 2.0) exposing the linked-account
 * tools. It exists because Claude Code passes a sensitive userConfig value (the plugin token)
 * only to MCP servers and hooks, never to commands a skill runs through Bash.
 *
 * Tools are read-only except remote_resync, which asks the server to re-collect metrics.
 * There is deliberately no tool that funds, claims or pays a bounty.
 */

import { createInterface } from "node:readline";
import { remoteCall, remoteConfig, remoteHeadline, RemoteError, type RemoteAction } from "./remote";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Tool {
  name: string;
  action: RemoteAction;
  description: string;
  readOnly: boolean;
}

export const TOOLS: Tool[] = [
  {
    name: "remote_portfolio",
    action: "portfolio",
    description:
      "The linked PORT4LLEO account's stored Builder Score, tier, last sync time and public portfolio URL, as the website shows them.",
    readOnly: true,
  },
  {
    name: "remote_resync",
    action: "resync",
    description:
      "Ask the PORT4LLEO website to re-collect the linked account's metrics from GitHub and store a new score. Allowed once an hour; takes up to a few minutes.",
    readOnly: false,
  },
  {
    name: "remote_bounties",
    action: "bounties",
    description:
      "Read-only list of funded, claimed or verified fix bounties on repositories the linked account can access on GitHub, plus open bounties on public repositories. Each has a link to its page on the PORT4LLEO website.",
    readOnly: true,
  },
];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  version: string;
}

/** Handles one message; returns the response, or null for notifications. */
export async function handleMcpMessage(msg: JsonRpcRequest, deps: McpDeps): Promise<object | null> {
  const isNotification = msg.id === undefined || msg.id === null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "port4lleo", version: deps.version },
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: true },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(msg.params?.name)}`);
      try {
        const out = await remoteCall(tool.action, remoteConfig(deps.env), deps.fetchImpl);
        const text = JSON.stringify({ headline: remoteHeadline(tool.action, out), result: out }, null, 2);
        return reply({ content: [{ type: "text", text }] });
      } catch (e) {
        const text = e instanceof RemoteError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return isNotification ? null : fail(-32601, `Method not found: ${msg.method}`);
  }
}

export function serveMcp(deps: McpDeps) {
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(line) as JsonRpcRequest;
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }
    void handleMcpMessage(msg, deps).then((res) => {
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    });
  });
}

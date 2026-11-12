import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run } from "@/plugin/cli";
import { handleMcpMessage, TOOLS } from "@/plugin/mcp";
import { DEFAULT_BASE_URL, NOT_LINKED, remoteCall, remoteConfig, RemoteError } from "@/plugin/remote";

const TOKEN = `p4l_${"A".repeat(43)}`;

describe("remoteConfig", () => {
  it("needs a token, and treats an unset userConfig placeholder as unset", () => {
    expect(() => remoteConfig({})).toThrow(NOT_LINKED);
    expect(() => remoteConfig({ PORT4LLEO_TOKEN: "  " })).toThrow(NOT_LINKED);
    expect(() => remoteConfig({ PORT4LLEO_TOKEN: "${user_config.api_token}" })).toThrow(NOT_LINKED);
    expect(() => remoteConfig({ PORT4LLEO_TOKEN: "ghp_notours" })).toThrow(/malformed/);
  });

  it("defaults to the PORT4LLEO website and refuses plain http except on localhost", () => {
    expect(remoteConfig({ PORT4LLEO_TOKEN: TOKEN })).toEqual({ token: TOKEN, baseUrl: DEFAULT_BASE_URL });
    expect(remoteConfig({ PORT4LLEO_TOKEN: TOKEN, PORT4LLEO_URL: "${user_config.base_url}" }).baseUrl).toBe(DEFAULT_BASE_URL);
    expect(remoteConfig({ PORT4LLEO_TOKEN: TOKEN, PORT4LLEO_URL: "https://self.example/path" }).baseUrl).toBe("https://self.example");
    expect(remoteConfig({ PORT4LLEO_TOKEN: TOKEN, PORT4LLEO_URL: "http://localhost:3000" }).baseUrl).toBe("http://localhost:3000");
    expect(() => remoteConfig({ PORT4LLEO_TOKEN: TOKEN, PORT4LLEO_URL: "http://self.example" })).toThrow(/https/);
    expect(() => remoteConfig({ PORT4LLEO_TOKEN: TOKEN, PORT4LLEO_URL: "not a url" })).toThrow(/not a URL/);
  });
});

describe("remoteCall", () => {
  const cfg = { token: TOKEN, baseUrl: "https://p.test" };

  it("sends the bearer token and no body", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ login: "alice", score: 1 }));
    await remoteCall("resync", cfg, fetchImpl as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://p.test/api/plugin/resync");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("surfaces the server's error and Retry-After", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "Synced recently. Try again in 40 min." }, { status: 429, headers: { "Retry-After": "2400" } }));
    const err = (await remoteCall("resync", cfg, fetchImpl as typeof fetch).catch((e: unknown) => e)) as RemoteError;
    expect(err).toBeInstanceOf(RemoteError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Synced recently. Try again in 40 min. (retry after 2400s)");
  });
});

describe("CLI remote", () => {
  it("runs portfolio and resync against the configured site", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ login: "alice", score: 640, tier: "Builder", lastSyncedAt: "t" }));
    const out = await run(["remote", "portfolio"], undefined, { PORT4LLEO_TOKEN: TOKEN }, fetchImpl as typeof fetch);
    expect(out.headline).toBe("alice: 640 (Builder), last synced t");
    expect(out.command).toBe("remote-portfolio");
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${DEFAULT_BASE_URL}/api/plugin/portfolio`);
  });

  it("lists bounties read-only (GET, no body)", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ bounties: [{ id: "b1" }], reposChecked: 3 }));
    const out = await run(["remote", "bounties"], undefined, { PORT4LLEO_TOKEN: TOKEN }, fetchImpl as typeof fetch);
    expect(out.headline).toBe("1 live bounty across 3 accessible repos plus the public board");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE_URL}/api/plugin/bounties`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("rejects unknown remote actions", async () => {
    await expect(run(["remote", "fund"], undefined, { PORT4LLEO_TOKEN: TOKEN })).rejects.toThrow(/port4lleo <command>/);
    await expect(run(["remote", "toString"], undefined, { PORT4LLEO_TOKEN: TOKEN })).rejects.toThrow(/port4lleo <command>/);
  });
});

describe("MCP server", () => {
  const deps = (env: Record<string, string> = { PORT4LLEO_TOKEN: TOKEN }, fetchImpl = vi.fn(async () => Response.json({ login: "alice", score: null }))) => ({
    env,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    version: "test",
  });

  it("initializes with a supported protocol version", async () => {
    const res = (await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, deps())) as {
      result: { protocolVersion: string; capabilities: object };
    };
    expect(res.result.protocolVersion).toBe("2025-03-26");
    expect(res.result.capabilities).toEqual({ tools: {} });
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull();
  });

  it("lists only read and re-sync tools: nothing that funds, claims or pays", async () => {
    const res = (await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps())) as { result: { tools: { name: string }[] } };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
    for (const n of names) expect(n).not.toMatch(/fund|claim|pay|approve|cancel/);
  });

  it("calls the website and returns its answer", async () => {
    const res = (await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "remote_portfolio", arguments: {} } }, deps())) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    expect(res.result.isError).toBeUndefined();
    expect(JSON.parse(res.result.content[0].text).headline).toBe("alice: no stored score yet");
  });

  it("explains how to link when no token is set, as a tool error", async () => {
    const fetchImpl = vi.fn();
    const res = (await handleMcpMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "remote_resync" } },
      deps({}, fetchImpl as never),
    )) as { result: { content: { text: string }[]; isError: boolean } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe(NOT_LINKED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers unknown methods with a JSON-RPC error", async () => {
    const res = (await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "resources/list" }, deps())) as { error: { code: number } };
    expect(res.error.code).toBe(-32601);
  });
});

describe("plugin manifest", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", "claude-plugin", ".claude-plugin", "plugin.json"), "utf8"));
  const main = readFileSync(join(__dirname, "..", "src", "plugin", "main.ts"), "utf8");

  it("keeps the token sensitive and passes it only to the plugin's MCP server", () => {
    expect(manifest.userConfig.api_token.sensitive).toBe(true);
    expect(manifest.userConfig.api_token.required).toBeUndefined();
    expect(manifest.mcpServers.port4lleo.env.PORT4LLEO_TOKEN).toBe("${user_config.api_token}");
  });

  it("matches the version the bundle reports", () => {
    expect(main).toContain(`const VERSION = "${manifest.version}"`);
  });
});

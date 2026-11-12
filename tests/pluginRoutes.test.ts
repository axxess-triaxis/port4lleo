import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A Supabase client stand-in: every query builder call is recorded; results come from `tables`. */
type Result = { data: unknown; error?: unknown; count?: number };
type Ops = [string, unknown[]][];
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Result | ((ops: Ops) => Result)>,
  rpc: { data: null as unknown, error: null as unknown },
  log: [] as { table: string; ops: Ops }[],
  sessionUser: null as { id: string } | null,
}));

function fakeAdmin() {
  return {
    rpc: vi.fn(() => ({ maybeSingle: async () => state.rpc })),
    from(table: string) {
      const ops: Ops = [];
      state.log.push({ table, ops });
      const res = () => {
        const r = state.tables[table];
        return { error: null, ...(typeof r === "function" ? r(ops) : (r ?? { data: null })) };
      };
      const b: object = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko);
            if (prop === "maybeSingle" || prop === "single") return async () => res();
            return (...args: unknown[]) => {
              ops.push([String(prop), args]);
              return b;
            };
          },
        },
      );
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  createAdminClient: () => fakeAdmin(),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sync", async (orig) => ({ ...(await orig<typeof import("@/lib/sync")>()), syncUser: vi.fn() }));

import { GET as portfolioGET } from "@/app/api/plugin/portfolio/route";
import { POST as resyncPOST } from "@/app/api/plugin/resync/route";
import { DELETE as tokensDELETE, POST as tokensPOST } from "@/app/api/plugin/tokens/route";
import { generatePluginToken, hashPluginToken, MAX_ACTIVE_PLUGIN_TOKENS } from "@/lib/plugin/tokens";
import { syncUser } from "@/lib/sync";

const TOKEN = generatePluginToken().token;
const bearer = (path: string, init: { method?: string; body?: string } = {}) =>
  new NextRequest(`https://port4lleo.test${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}` } });

beforeEach(() => {
  state.tables = {};
  state.log = [];
  state.rpc = { data: { user_id: "u1", allowed: true, retry_after_seconds: 0 }, error: null };
  state.sessionUser = null;
  vi.mocked(syncUser).mockReset();
});

describe("GET /api/plugin/portfolio", () => {
  it("401s without a valid token", async () => {
    state.rpc = { data: null, error: null };
    expect((await portfolioGET(bearer("/api/plugin/portfolio"))).status).toBe(401);
    expect((await portfolioGET(new NextRequest("https://port4lleo.test/api/plugin/portfolio"))).status).toBe(401);
  });

  it("returns the caller's stored score, tier and last sync", async () => {
    state.tables.profiles = { data: { login: "alice", is_public: true, last_synced_at: "2026-10-25T08:00:00.000Z" } };
    state.tables.snapshots = { data: { score: 640, computed_at: "2026-10-25T08:00:00.000Z" } };
    const res = await portfolioGET(bearer("/api/plugin/portfolio"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      login: "alice",
      score: 640,
      computedAt: "2026-10-25T08:00:00.000Z",
      lastSyncedAt: "2026-10-25T08:00:00.000Z",
      isPublic: true,
      portfolioUrl: "https://port4lleo.test/u/alice",
    });
    expect(typeof body.tier).toBe("string");
    // Scoped to the token's owner.
    for (const { ops } of state.log) expect(ops).toContainEqual([ "eq", [expect.stringMatching(/^(id|user_id)$/), "u1"] ]);
  });

  it("reports a missing score as null rather than zero", async () => {
    state.tables.profiles = { data: { login: "alice", is_public: false, last_synced_at: null } };
    const body = await (await portfolioGET(bearer("/api/plugin/portfolio"))).json();
    expect(body.score).toBeNull();
    expect(body.tier).toBeNull();
  });
});

describe("POST /api/plugin/resync", () => {
  it("respects the sync cooldown and never starts a sync", async () => {
    state.tables.profiles = { data: { last_synced_at: new Date(Date.now() - 10 * 60_000).toISOString() } };
    const res = await resyncPOST(bearer("/api/plugin/resync", { method: "POST" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(syncUser).not.toHaveBeenCalled();
  });

  it("syncs server-side for the token's owner, ignoring any client-sent metrics", async () => {
    state.tables.profiles = { data: { last_synced_at: null } };
    vi.mocked(syncUser).mockResolvedValue({ score: 700, tier: "Builder", login: "alice", warnings: [] });
    const res = await resyncPOST(
      bearer("/api/plugin/resync", { method: "POST", body: JSON.stringify({ score: 1000, metrics: { repos: 9999 } }) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 700, login: "alice" });
    expect(syncUser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncUser).mock.calls[0]).toHaveLength(2);
    expect(vi.mocked(syncUser).mock.calls[0][1]).toBe("u1");
  });

  it("is rate limited per token before anything else runs", async () => {
    state.rpc = { data: { user_id: "u1", allowed: false, retry_after_seconds: 30 }, error: null };
    expect((await resyncPOST(bearer("/api/plugin/resync", { method: "POST" }))).status).toBe(429);
    expect(state.log).toHaveLength(0);
  });
});

describe("/api/plugin/tokens", () => {
  it("requires a signed-in user", async () => {
    expect((await tokensPOST()).status).toBe(401);
  });

  it("returns the token once and stores only its hash and last four characters", async () => {
    state.sessionUser = { id: "u1" };
    state.tables.plugin_tokens = (ops) =>
      ops.some(([m]) => m === "insert") ? { data: { id: "t1", last4: "abcd", created_at: "now" } } : { data: null, count: 0 };
    const res = await tokensPOST();
    expect(res.status).toBe(201);
    const { token } = await res.json();
    const insert = state.log.flatMap((l) => l.ops).find(([m]) => m === "insert")?.[1][0] as Record<string, string>;
    expect(insert).toEqual({ user_id: "u1", token_hash: hashPluginToken(token), last4: token.slice(-4) });
    expect(JSON.stringify(insert)).not.toContain(token);
  });

  it(`refuses more than ${MAX_ACTIVE_PLUGIN_TOKENS} active tokens`, async () => {
    state.sessionUser = { id: "u1" };
    state.tables.plugin_tokens = { data: null, count: MAX_ACTIVE_PLUGIN_TOKENS };
    expect((await tokensPOST()).status).toBe(409);
  });

  it("revokes only the caller's own token", async () => {
    state.sessionUser = { id: "u1" };
    const id = "8f14e45f-ceea-4e7a-9b3c-1d2e3f405162";
    state.tables.plugin_tokens = { data: null };
    const req = () => new NextRequest("https://port4lleo.test/api/plugin/tokens", { method: "DELETE", body: JSON.stringify({ id }) });
    expect((await tokensDELETE(req())).status).toBe(404);
    expect(state.log[0].ops).toEqual(
      expect.arrayContaining([
        ["update", [{ revoked: true }]],
        ["eq", ["id", id]],
        ["eq", ["user_id", "u1"]],
      ]),
    );
    state.tables.plugin_tokens = { data: { id } };
    expect((await tokensDELETE(req())).status).toBe(200);
  });
});

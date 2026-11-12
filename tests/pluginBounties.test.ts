import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  rpc: { data: null as unknown, error: null as unknown },
  ghToken: "ghu_live" as string | Error,
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseConfigured: () => true,
  createAdminClient: () => ({ rpc: () => ({ maybeSingle: async () => state.rpc }) }),
}));
vi.mock("@/lib/github/userToken", () => ({
  getUserAccessToken: async () => {
    if (state.ghToken instanceof Error) throw state.ghToken;
    return state.ghToken;
  },
}));
vi.mock("@/lib/bounties/pluginView", async (orig) => ({
  ...(await orig<typeof import("@/lib/bounties/pluginView")>()),
  bountiesForPlugin: vi.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { GET } from "@/app/api/plugin/bounties/route";
import type { BountyRow } from "@/lib/bounties/service";
import { bountiesForPlugin as mockedBounties, toPluginBounty, type PluginBountyDeps } from "@/lib/bounties/pluginView";
import { generatePluginToken } from "@/lib/plugin/tokens";

const { bountiesForPlugin } = await vi.importActual<typeof import("@/lib/bounties/pluginView")>("@/lib/bounties/pluginView");

function row(p: Partial<BountyRow>): BountyRow {
  return {
    id: "b1",
    installation_id: 1,
    repo: "acme/web",
    repo_private: true,
    alert_number: 3,
    alert_url: "https://github.com/acme/web/security/dependabot/3",
    severity: "high",
    package: "next",
    summary: "SSRF",
    amount_value: "25.00",
    currency: "USD",
    status: "funded",
    funder_user_id: "funder",
    funder_login: "boss",
    paypal_order_id: "ORDER-SECRET",
    paypal_capture_id: "CAPTURE-SECRET",
    claimant_user_id: null,
    claimant_login: null,
    pr_number: null,
    pr_url: null,
    payout_email_ciphertext: "cipher",
    verification: null,
    agent_recommendation: null,
    payout_batch_id: null,
    payout_status: null,
    created_at: "2026-10-01T00:00:00Z",
    funded_at: "2026-10-02T00:00:00Z",
    paid_at: null,
    ...p,
  };
}

const admin = {} as SupabaseClient;
const ORIGIN = "https://port4lleo.test";

function deps(rows: BountyRow[], publicRows: BountyRow[] = [], visibleRepos = ["acme/web"]) {
  const live = vi.fn(async (_a: SupabaseClient, repos: string[]) => new Map(rows.filter((r) => repos.includes(r.repo)).map((r) => [r.id, r])));
  const d: PluginBountyDeps = {
    installations: vi.fn(async () => [{ id: 1, account: { login: "acme", type: "Organization", avatar_url: "" }, repository_selection: "all" }]),
    repos: vi.fn(async () => visibleRepos),
    live,
    open: vi.fn(async () => publicRows),
  };
  return { d, live };
}

describe("bountiesForPlugin", () => {
  it("lists private-repo bounties only for repos GitHub says the caller can access", async () => {
    const mine = row({ id: "b1", repo: "acme/web" });
    const hidden = row({ id: "b2", repo: "acme/secret" });
    const { d, live } = deps([mine, hidden]);
    const out = await bountiesForPlugin(admin, { userId: "u1", token: "ghu" }, ORIGIN, d);
    expect(out.bounties.map((b) => b.id)).toEqual(["b1"]);
    expect(out.reposChecked).toBe(1);
    expect(d.installations).toHaveBeenCalledWith("ghu");
    expect(live.mock.calls[0][1]).toEqual(["acme/web"]);
  });

  it("adds open public bounties and drops drafts and finished ones", async () => {
    const pub = row({ id: "p1", repo: "oss/lib", repo_private: false, funded_at: "2026-10-05T00:00:00Z" });
    const { d } = deps([row({ id: "d1", status: "draft" }), row({ id: "c1", status: "claimed", claimant_user_id: "u1", claimant_login: "me" })], [pub]);
    const out = await bountiesForPlugin(admin, { userId: "u1", token: "ghu" }, ORIGIN, d);
    expect(out.bounties.map((b) => [b.id, b.role])).toEqual([
      ["p1", null],
      ["c1", "claimant"],
    ]);
  });

  it("queries large repo lists in chunks", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `acme/r${i}`);
    const { d, live } = deps([], [], many);
    await bountiesForPlugin(admin, { userId: "u1", token: "ghu" }, ORIGIN, d);
    expect(live.mock.calls.map((c) => c[1].length)).toEqual([100, 100, 50]);
  });

  it("never exposes PayPal ids, payout emails or verification internals", () => {
    const b = toPluginBounty(row({ funder_user_id: "u1" }), "u1", ORIGIN);
    expect(b.url).toBe(`${ORIGIN}/bounties/b1`);
    expect(b.role).toBe("funder");
    const json = JSON.stringify(b);
    for (const secret of ["ORDER-SECRET", "CAPTURE-SECRET", "cipher", "payout", "verification"]) expect(json).not.toContain(secret);
  });
});

describe("GET /api/plugin/bounties", () => {
  const req = () => new NextRequest(`${ORIGIN}/api/plugin/bounties`, { headers: { authorization: `Bearer ${generatePluginToken().token}` } });

  beforeEach(() => {
    state.rpc = { data: { user_id: "u1", allowed: true, retry_after_seconds: 0 }, error: null };
    state.ghToken = "ghu_live";
    vi.mocked(mockedBounties).mockReset();
  });

  it("401s without a valid token", async () => {
    state.rpc = { data: null, error: null };
    expect((await GET(req())).status).toBe(401);
    expect(mockedBounties).not.toHaveBeenCalled();
  });

  it("checks access with the caller's own GitHub token", async () => {
    vi.mocked(mockedBounties).mockResolvedValue({ bounties: [], reposChecked: 4 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bounties: [], reposChecked: 4, note: expect.stringMatching(/Read-only/) });
    expect(vi.mocked(mockedBounties).mock.calls[0][1]).toEqual({ userId: "u1", token: "ghu_live" });
  });

  it("asks the user to sign in again when the GitHub token can't be refreshed", async () => {
    state.ghToken = new Error("refresh failed");
    expect((await GET(req())).status).toBe(409);
  });

  it("fails closed when GitHub can't be checked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(mockedBounties).mockRejectedValue(new Error("GitHub 502"));
    expect((await GET(req())).status).toBe(502);
  });
});

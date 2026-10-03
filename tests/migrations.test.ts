/**
 * Applies every migration to an in-process Postgres (PGlite) set up like a current
 * Supabase project -- API roles exist but get NO default table privileges -- and checks
 * what each role can actually do. Guards the 2026-10-03 production 42501 regression.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "supabase", "migrations");
const ALICE = "00000000-0000-0000-0000-00000000000a"; // public profile
const BOB = "00000000-0000-0000-0000-00000000000b"; // private profile

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to public;
    create role anon; create role authenticated; create role service_role bypassrls;`);
  for (const f of readdirSync(DIR).sort()) await db.exec(readFileSync(join(DIR, f), "utf8"));
  await db.exec(`
    insert into auth.users values ('${ALICE}'), ('${BOB}');
    insert into public.profiles (id, login, is_public) values ('${ALICE}','alice',true), ('${BOB}','bob',false);`);
}, 60_000);

async function as<T>(role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${sub ?? ""}'; set role ${role}`);
  try {
    return { rows: (await db.query<T>(sql)).rows, error: null as string | null };
  } catch (e) {
    return { rows: [] as T[], error: (e as Error).message };
  } finally {
    await db.exec("reset role");
  }
}

describe("migrations: privileges + RLS", () => {
  it("server (service_role) can write every table, including identity columns", async () => {
    expect((await as("service_role", null, `insert into public.snapshots (user_id, metrics, score) values ('${ALICE}','{}',500)`)).error).toBeNull();
    expect((await as("service_role", null, `insert into public.installations (id, account_login, account_type) values (7,'acme','Organization')`)).error).toBeNull();
    expect((await as("service_role", null, `insert into public.audits (installation_id, report, summary) values (7,'{}','{}')`)).error).toBeNull();
    expect((await as("service_role", null, `insert into public.github_tokens (user_id, ciphertext) values ('${ALICE}','x')`)).error).toBeNull();
    expect((await as("service_role", null, `insert into public.marketplace_events (action, payload) values ('purchased','{}')`)).error).toBeNull();
  });

  it("anon reads public portfolios only", async () => {
    expect((await as<{ login: string }>("anon", null, "select login from public.profiles")).rows).toEqual([{ login: "alice" }]);
    expect((await as("anon", null, "select score from public.snapshots")).error).toBeNull();
    expect((await as("anon", null, "select * from public.overrides")).error).toBeNull();
  });

  it.each(["github_tokens", "vercel_tokens", "installations", "audits", "marketplace_events"])(
    "anon and authenticated are refused %s entirely",
    async (table) => {
      expect((await as("anon", null, `select * from public.${table}`)).error).toMatch(/permission denied/);
      expect((await as("authenticated", BOB, `select * from public.${table}`)).error).toMatch(/permission denied/);
    },
  );

  it("owners may only toggle their own visibility", async () => {
    expect((await as<{ login: string }>("authenticated", BOB, "update public.profiles set is_public=true where login='bob' returning login")).rows).toEqual([{ login: "bob" }]);
    expect((await as("authenticated", BOB, "update public.profiles set is_public=false where login='alice' returning login")).rows).toEqual([]);
    expect((await as("authenticated", BOB, "update public.profiles set login='alice2' where login='bob'")).error).toMatch(/permission denied/);
    expect((await as("anon", null, "update public.profiles set is_public=false")).error).toMatch(/permission denied/);
  });

  it("owners write only their own overrides; nobody but the server writes snapshots", async () => {
    expect((await as("authenticated", BOB, `insert into public.overrides (user_id) values ('${BOB}')`)).error).toBeNull();
    expect((await as("authenticated", BOB, `insert into public.overrides (user_id) values ('${ALICE}')`)).error).toMatch(/row-level security/);
    expect((await as("authenticated", BOB, `insert into public.snapshots (user_id, metrics, score) values ('${BOB}','{}',1)`)).error).toMatch(/permission denied/);
  });

  it("uninstall cascades: deleting an installation removes its audits", async () => {
    await as("service_role", null, "delete from public.installations where id = 7");
    expect((await as<{ n: number }>("service_role", null, "select count(*)::int n from public.audits")).rows[0].n).toBe(0);
  });
});

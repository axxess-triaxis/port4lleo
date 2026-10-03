-- Explicit table privileges.
-- Newer Supabase projects no longer auto-grant table privileges to the API roles, so RLS
-- policies alone are not enough: without these GRANTs every request fails with
-- 42501 "permission denied" (observed on the production project, 2026-10-03).
-- Privileges say which operations a role may attempt; RLS still decides which rows.

grant usage on schema public to anon, authenticated, service_role;

-- Server (secret key): full access; it bypasses RLS and does all writes.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Public portfolio reads (RLS limits rows to public profiles, or the owner).
grant select on public.profiles, public.snapshots, public.overrides to anon, authenticated;

-- Owner self-service: visibility toggle only (login etc. stay server-managed; see init migration).
grant update (is_public) on public.profiles to authenticated;
grant insert, update on public.overrides to authenticated;

-- Deliberately NO grants to anon/authenticated on: github_tokens, vercel_tokens,
-- installations, audits, marketplace_events. Only the server reads those.

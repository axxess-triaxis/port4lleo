-- Per-user tokens that link the PORT4LLEO Claude plugin to an account.
-- Only a SHA-256 hash of each token is stored (tokens are 256-bit random, so an unsalted hash
-- is enough); the token itself is shown once, on creation. Server-only, like the other token
-- tables: RLS on, no client policies, no client grants.

create table public.plugin_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  last4 text not null check (char_length(last4) = 4),
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- Fixed-window rate limit, advanced atomically by use_plugin_token().
  window_started_at timestamptz,
  window_requests integer not null default 0
);
create index plugin_tokens_user_idx on public.plugin_tokens (user_id, created_at desc);

alter table public.plugin_tokens enable row level security;

-- Looks up a live (unrevoked) token by hash and counts one request against its window.
-- Returns no row for an unknown or revoked token.
create function public.use_plugin_token(p_hash text, p_limit integer, p_window_seconds integer)
returns table (user_id uuid, allowed boolean, retry_after_seconds integer)
language sql
set search_path = ''
as $$
  update public.plugin_tokens t set
    window_requests = case
      when t.window_started_at > now() - make_interval(secs => p_window_seconds) then t.window_requests + 1
      else 1 end,
    window_started_at = case
      when t.window_started_at > now() - make_interval(secs => p_window_seconds) then t.window_started_at
      else now() end,
    last_used_at = now()
  where t.token_hash = p_hash and not t.revoked
  returning
    t.user_id,
    t.window_requests <= p_limit,
    greatest(0, ceil(extract(epoch from t.window_started_at + make_interval(secs => p_window_seconds) - now())))::integer;
$$;

-- Explicit grants (new Supabase projects grant nothing by default; see 20261003000000).
grant all on public.plugin_tokens to service_role;
revoke all on function public.use_plugin_token(text, integer, integer) from public, anon, authenticated;
grant execute on function public.use_plugin_token(text, integer, integer) to service_role;
-- Deliberately NO table grants to anon/authenticated: tokens are created, listed and revoked
-- through server routes that check the signed-in user.

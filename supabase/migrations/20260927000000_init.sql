-- port4leo initial schema.
-- Writes to snapshots / tokens happen server-side with the secret (service-role) key only.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login text not null unique,
  name text,
  avatar_url text,
  is_public boolean not null default true,
  include_private boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_login_lower_idx on public.profiles (lower(login));

create table public.snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  metrics jsonb not null,
  score integer not null check (score between 0 and 1000),
  computed_at timestamptz not null default now()
);
create index snapshots_user_time_idx on public.snapshots (user_id, computed_at desc);

create table public.overrides (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Encrypted (AES-256-GCM, app-side) third-party tokens. No RLS policies = no client access at all.
create table public.github_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ciphertext text not null,
  scopes text,
  updated_at timestamptz not null default now()
);

create table public.vercel_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.snapshots enable row level security;
alter table public.overrides enable row level security;
alter table public.github_tokens enable row level security;
alter table public.vercel_tokens enable row level security;

-- Profiles: public ones are readable by anyone; owners can read and update their own.
create policy "profiles readable when public or own" on public.profiles
  for select using (is_public or auth.uid() = id);
create policy "profiles owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- Owners may only flip visibility; login / include_private / sync fields are server-managed
-- (otherwise a user could rename their login to take over another /u/<login> path).
revoke update on public.profiles from anon, authenticated;
grant update (is_public) on public.profiles to authenticated;

-- Snapshots: readable when the owning profile is public, or by the owner. Inserted by the server only.
create policy "snapshots readable when profile public or own" on public.snapshots
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
  );

-- Overrides: public read alongside the portfolio (they are displayed), owner write.
create policy "overrides readable when profile public or own" on public.overrides
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
  );
create policy "overrides owner insert" on public.overrides
  for insert with check (auth.uid() = user_id);
create policy "overrides owner update" on public.overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

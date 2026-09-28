-- GitHub App + governance (RepoWatch port).
-- New tables have RLS enabled and NO client policies: every read goes through server
-- routes that authorize per repository (an org member may not see every repo).

-- GitHub App user tokens expire (8 h); keep the refresh token alongside.
alter table public.github_tokens
  add column refresh_ciphertext text,
  add column expires_at timestamptz;

create table public.installations (
  id bigint primary key,                      -- GitHub installation id
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  repository_selection text,                  -- 'all' | 'selected'
  suspended_at timestamptz,
  last_audit_at timestamptz,
  created_at timestamptz not null default now()
);
create index installations_account_idx on public.installations (lower(account_login));

create table public.audits (
  id bigint generated always as identity primary key,
  installation_id bigint not null references public.installations (id) on delete cascade,
  report jsonb not null,                      -- AuditReport: masked findings only, never raw PII
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create index audits_installation_time_idx on public.audits (installation_id, created_at desc);

create table public.marketplace_events (
  id bigint generated always as identity primary key,
  action text not null,
  account_login text,
  account_type text,
  plan_name text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.installations enable row level security;
alter table public.audits enable row level security;
alter table public.marketplace_events enable row level security;

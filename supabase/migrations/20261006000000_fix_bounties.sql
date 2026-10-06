-- Fix bounties (PayPal AI Hackathon, 2026-10): an organisation funds a PayPal bounty on a
-- Dependabot alert; a developer claims it with the PR that fixes it; deterministic checks
-- plus an AI agent verify the fix; a human approves; PayPal Payouts pays the fixer.
--
-- Money records are never cascaded away: deleting an installation keeps its bounties
-- (installation_id becomes null) so every funded, paid or refunded bounty stays auditable.
-- Server-only, like installations/audits: RLS on, no client grants, no client policies.

create table public.bounties (
  id uuid primary key default gen_random_uuid(),
  installation_id bigint references public.installations (id) on delete set null,
  repo text not null,                              -- owner/name
  repo_private boolean not null default true,      -- unknown is treated as private
  alert_number integer not null check (alert_number > 0),
  alert_url text not null,
  severity text not null,
  package text not null,
  summary text not null default '',

  amount_value numeric(10, 2) not null check (amount_value >= 1 and amount_value <= 500),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),

  status text not null default 'draft' check (status in
    ('draft', 'funded', 'claimed', 'verified', 'paid', 'cancelled', 'refunded')),

  funder_user_id uuid not null references public.profiles (id),
  funder_login text not null,
  paypal_order_id text unique,
  paypal_capture_id text unique,

  claimant_user_id uuid references public.profiles (id),
  claimant_login text,
  pr_number integer,
  pr_url text,
  -- AES-256-GCM (lib/crypto). Never stored or logged in clear.
  payout_email_ciphertext text,

  verification jsonb,                              -- hard checks + agent report, see lib/bounties
  agent_recommendation text check (agent_recommendation in ('pay', 'reject')),

  approved_by_user_id uuid references public.profiles (id),
  payout_batch_id text unique,
  payout_status text,
  refund_id text unique,

  created_at timestamptz not null default now(),
  funded_at timestamptz,
  claimed_at timestamptz,
  verified_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),

  -- A paid bounty must name who was paid and how.
  constraint paid_has_payout check (status <> 'paid' or (payout_batch_id is not null and claimant_user_id is not null)),
  constraint funded_has_capture check (status not in ('funded', 'claimed', 'verified', 'paid', 'refunded') or paypal_capture_id is not null)
);

-- At most one live bounty per alert; finished ones (paid/cancelled/refunded) don't block a new one.
create unique index bounties_one_live_per_alert
  on public.bounties (repo, alert_number)
  where status in ('draft', 'funded', 'claimed', 'verified');
create index bounties_status_idx on public.bounties (status, created_at desc);
create index bounties_claimant_idx on public.bounties (claimant_user_id) where claimant_user_id is not null;

-- Append-only history of every state change and money movement.
create table public.bounty_events (
  id bigint generated always as identity primary key,
  bounty_id uuid not null references public.bounties (id),
  kind text not null,                              -- created, order_created, funded, claimed, verified, ...
  actor_login text,                                -- null for system/webhook events
  detail jsonb not null default '{}'::jsonb,       -- never holds the payout email
  created_at timestamptz not null default now()
);
create index bounty_events_bounty_idx on public.bounty_events (bounty_id, created_at);

alter table public.bounties enable row level security;
alter table public.bounty_events enable row level security;

-- Explicit grants (new Supabase projects grant nothing by default; see 20261003000000).
grant all on public.bounties, public.bounty_events to service_role;
grant usage, select on all sequences in schema public to service_role;
-- Deliberately NO grants to anon/authenticated: bounty data is served only through server
-- routes that check GitHub access for private repositories.

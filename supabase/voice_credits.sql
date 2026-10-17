-- ============================================================
-- Human AI — public Text2Voice quotas + token requests.
-- Run ONCE in the Supabase SQL editor (safe to re-run).
-- Free quota: 10 voice generations per user (5s each, 1 token each).
-- Extra tokens only via admin approval ("Ask the admin for more tokens").
-- ============================================================

create table if not exists public.voice_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 10,
  used_total integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_token_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null default 10,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists voice_token_requests_status_idx
  on public.voice_token_requests(status, created_at desc);

alter table public.voice_credits enable row level security;
alter table public.voice_token_requests enable row level security;
-- Deny-by-default: all access goes through the service-role key, server-side.

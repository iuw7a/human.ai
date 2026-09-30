-- ============================================================
-- Human AI Desktop app — device login codes (idempotent)
-- Run once in the Supabase SQL editor.
-- ============================================================

create table if not exists public.desktop_device_codes (
  code text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'consumed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  decided_at timestamptz
);

alter table public.desktop_device_codes enable row level security;

drop policy if exists "service role only" on public.desktop_device_codes;
create policy "service role only" on public.desktop_device_codes
  for all using (false) with check (false);

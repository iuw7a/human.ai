-- ============================================================
-- Human AI — Computer Use agent runs (idempotent, best-effort log)
-- Run in the Supabase SQL editor. The agent works without it;
-- logging is skipped silently if the table is missing.
-- ============================================================

create table if not exists public.agent_runs (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null default '',
  status text not null default 'active',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_runs enable row level security;

drop policy if exists "own agent runs" on public.agent_runs;
create policy "own agent runs" on public.agent_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

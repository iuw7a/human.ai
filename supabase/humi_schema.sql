-- ============================================================
-- Human AI — Humi personal assistants (idempotent, safe to re-run)
-- Run in the Supabase SQL editor AFTER supabase/schema.sql.
-- One row per user's personal Humi. Conversations reuse public.chats
-- via chats.humi_assistant_id (NULL = regular Human AI chat).
-- ============================================================

create table if not exists public.humi_assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Humi' check (char_length(name) between 1 and 80),
  avatar_url text not null default '' check (char_length(avatar_url) <= 400000),
  personality text not null default 'friendly'
    check (personality in ('friendly', 'professional', 'funny', 'calm', 'custom')),
  custom_instructions text not null default ''
    check (char_length(custom_instructions) <= 2000),
  language text not null default 'auto'
    check (language in ('auto', 'ar', 'de', 'en')),
  voice text not null default 'server',
  voice_enabled boolean not null default true,
  model_id text not null default 'human-ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link Humi conversations to their assistant (NULL = normal chat).
alter table public.chats
  add column if not exists humi_assistant_id uuid references public.humi_assistants(id) on delete cascade;

create index if not exists humi_assistants_user_updated_idx
  on public.humi_assistants(user_id, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'chats_humi_assistant_idx'
  ) then
    create index chats_humi_assistant_idx on public.chats(humi_assistant_id, updated_at desc);
  end if;
end $$;

-- ============================================================
-- Row Level Security: owners only (same pattern as schema.sql)
-- ============================================================
alter table public.humi_assistants enable row level security;

drop policy if exists "own humi assistants" on public.humi_assistants;
create policy "own humi assistants" on public.humi_assistants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

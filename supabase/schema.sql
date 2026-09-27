-- ============================================================
-- Human AI — Supabase schema (idempotent, safe to re-run)
-- Run this in the Supabase SQL editor (one project, one run).
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null default 'kimi-k3',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);

-- Repair: add any columns missing from partial earlier runs
alter table public.profiles
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz not null default now();

alter table public.chats
  add column if not exists user_id uuid,
  add column if not exists model_id text not null default 'kimi-k3',
  add column if not exists title text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.messages
  add column if not exists chat_id text,
  add column if not exists user_id uuid,
  add column if not exists role text not null default 'user',
  add column if not exists content text not null default '',
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now();

alter table public.memories
  add column if not exists user_id uuid,
  add column if not exists content text,
  add column if not exists created_at timestamptz not null default now();

alter table public.attachments
  add column if not exists user_id uuid,
  add column if not exists chat_id text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists size_bytes integer,
  add column if not exists created_at timestamptz not null default now();

-- Index (only if the column exists now)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'chat_id'
  ) and not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'messages_chat_idx'
  ) then
    create index messages_chat_idx on public.messages(chat_id, created_at);
  end if;
end $$;

-- Storage bucket for image uploads (private; app uses signed URLs)
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ============================================================
-- Row Level Security: users can only ever touch their own rows
-- ============================================================
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.attachments enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own chats" on public.chats;
create policy "own chats" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own memories" on public.memories;
create policy "own memories" on public.memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own attachments" on public.attachments;
create policy "own attachments" on public.attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Realtime: sidebar updates instantly on chat changes.
-- Safe to re-run. Requires no app changes; REST stays the source of truth.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

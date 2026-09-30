-- ============================================================
-- Human AI — Human Bot schema (idempotent, safe to re-run)
-- Pro-only persistent AI companions. Run in Supabase SQL editor.
-- ============================================================

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  description text not null default '',
  personality text not null default '',
  instructions text not null default '',
  model_id text not null default 'human-ai',
  memory_enabled boolean not null default true,
  include_user_memory boolean not null default false,
  tools jsonb not null default '{"web_search": true, "mcp_server_ids": []}'::jsonb,
  theme jsonb not null default '{"accent": "#e5484d"}'::jsonb,
  voice jsonb not null default '{"tts_enabled": false, "stt_enabled": false}'::jsonb,
  companion jsonb not null default '{"x": null, "y": null, "size": 72, "always_on_top": true, "hidden": false}'::jsonb,
  avatar_path text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_conversations (
  id text primary key,
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null references public.bot_conversations(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_memories (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Bot image gallery (up to 4 per Bot; lowest position = primary avatar)
create table if not exists public.bot_images (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bot_images
  add column if not exists bot_id uuid,
  add column if not exists user_id uuid,
  add column if not exists storage_path text,
  add column if not exists position integer not null default 0,
  add column if not exists created_at timestamptz not null default now();
alter table public.bots
  add column if not exists owner_id uuid,
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists description text not null default '',
  add column if not exists personality text not null default '',
  add column if not exists instructions text not null default '',
  add column if not exists model_id text not null default 'human-ai',
  add column if not exists memory_enabled boolean not null default true,
  add column if not exists include_user_memory boolean not null default false,
  add column if not exists tools jsonb not null default '{"web_search": true, "mcp_server_ids": []}'::jsonb,
  add column if not exists theme jsonb not null default '{"accent": "#e5484d"}'::jsonb,
  add column if not exists voice jsonb not null default '{"tts_enabled": false, "stt_enabled": false}'::jsonb,
  add column if not exists companion jsonb not null default '{"x": null, "y": null, "size": 72, "always_on_top": true, "hidden": false}'::jsonb,
  add column if not exists avatar_path text,
  add column if not exists last_active_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.bot_conversations
  add column if not exists bot_id uuid,
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.bot_messages
  add column if not exists conversation_id text,
  add column if not exists bot_id uuid,
  add column if not exists user_id uuid,
  add column if not exists role text not null default 'user',
  add column if not exists content text not null default '',
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now();

alter table public.bot_memories
  add column if not exists bot_id uuid,
  add column if not exists user_id uuid,
  add column if not exists content text,
  add column if not exists created_at timestamptz not null default now();

-- Unique slug (case-insensitive app-level; DB unique on exact value)
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bots_slug_idx'
  ) then
    create unique index bots_slug_idx on public.bots(slug);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bots_owner_idx'
  ) then
    create index bots_owner_idx on public.bots(owner_id, updated_at desc);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bot_conversations_bot_idx'
  ) then
    create index bot_conversations_bot_idx on public.bot_conversations(bot_id, updated_at desc);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bot_messages_conv_idx'
  ) then
    create index bot_messages_conv_idx on public.bot_messages(conversation_id, created_at);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bot_memories_bot_idx'
  ) then
    create index bot_memories_bot_idx on public.bot_memories(bot_id, created_at);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bot_images_bot_idx'
  ) then
    create index bot_images_bot_idx on public.bot_images(bot_id, position);
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'bot_tasks_bot_idx'
  ) then
    create index bot_tasks_bot_idx on public.bot_tasks(bot_id, done, created_at);
  end if;
end $$;

-- Public bucket for bot avatars (uploads go through the API with service role)
insert into storage.buckets (id, name, public)
values ('bot-avatars', 'bot-avatars', true)
on conflict (id) do update set public = true;

-- ============================================================
-- RLS: owners only, always
-- ============================================================
alter table public.bots enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.bot_messages enable row level security;
alter table public.bot_memories enable row level security;
alter table public.bot_images enable row level security;
alter table public.bot_tasks enable row level security;

drop policy if exists "own bots" on public.bots;
create policy "own bots" on public.bots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "own bot conversations" on public.bot_conversations;
create policy "own bot conversations" on public.bot_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bot messages" on public.bot_messages;
create policy "own bot messages" on public.bot_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bot memories" on public.bot_memories;
create policy "own bot memories" on public.bot_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bot images" on public.bot_images;
create policy "own bot images" on public.bot_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bot tasks" on public.bot_tasks;
create policy "own bot tasks" on public.bot_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bot tasks (reminders/todos per Bot; companion polls due items)
create table if not exists public.bot_tasks (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_at timestamptz,
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bot_tasks
  add column if not exists bot_id uuid,
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists done boolean not null default false,
  add column if not exists due_at timestamptz,
  add column if not exists notified boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

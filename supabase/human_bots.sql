-- ============================================================
-- Human AI Bots marketplace (idempotent, safe to re-run)
-- Run once in the Supabase SQL editor.
-- Adds: visibility + category on bots, knowledge entries,
-- favorites, knowledge bucket. Then run seed_official_bots.sql.
-- ============================================================

alter table public.bots
  add column if not exists visibility text not null default 'private',
  add column if not exists category text not null default 'General';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bots_visibility_check'
  ) then
    alter table public.bots
      add constraint bots_visibility_check check (visibility in ('private', 'unlisted', 'public'));
  end if;
end $$;

create index if not exists bots_visibility_idx on public.bots(visibility);
create index if not exists bots_owner_idx on public.bots(owner_id);

-- ---------- bot_id on messages (exact per-bot analytics) ----------
alter table public.bot_messages
  add column if not exists bot_id uuid references public.bots(id) on delete cascade;

update public.bot_messages m
  set bot_id = c.bot_id
  from public.bot_conversations c
  where m.conversation_id = c.id and m.bot_id is null;

create index if not exists bot_messages_bot_idx on public.bot_messages(bot_id);

-- ---------- knowledge ----------
create table if not exists public.bot_knowledge (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'url', 'file')),
  title text not null default '',
  content text not null default '',
  file_path text,
  created_at timestamptz not null default now()
);

create index if not exists bot_knowledge_bot_idx on public.bot_knowledge(bot_id);

alter table public.bot_knowledge enable row level security;

drop policy if exists "own bot knowledge" on public.bot_knowledge;
create policy "own bot knowledge" on public.bot_knowledge
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- favorites ----------
create table if not exists public.bot_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);

alter table public.bot_favorites enable row level security;

drop policy if exists "own bot favorites" on public.bot_favorites;
create policy "own bot favorites" on public.bot_favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- knowledge bucket (private; server reads via service role) ----------
insert into storage.buckets (id, name, public)
values ('bot-knowledge', 'bot-knowledge', false)
on conflict (id) do nothing;

drop policy if exists "own knowledge files" on storage.objects;
create policy "own knowledge files" on storage.objects
  for all using (bucket_id = 'bot-knowledge' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'bot-knowledge' and auth.uid()::text = (storage.foldername(name))[1]);

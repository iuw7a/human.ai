-- ============================================================
-- Human AI — Admin Control Center schema (idempotent, safe to re-run)
-- Run AFTER supabase/schema.sql in the Supabase SQL editor.
-- ============================================================

-- ---------- profiles: roles, plans, status ----------
alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists plan text not null default 'free',
  add column if not exists status text not null default 'active',
  add column if not exists banned_at timestamptz,
  add column if not exists admin_notes text,
  add column if not exists last_seen_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('user', 'editor', 'support', 'admin', 'super_admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles add constraint profiles_plan_check
      check (plan in ('free', 'plus'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check
      check (status in ('active', 'banned', 'disabled'));
  end if;
end $$;

-- ---------- audit logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- ---------- auth events (logins, failures, logouts) ----------
create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  type text not null check (type in ('login', 'login_failed', 'logout')),
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists auth_events_created_idx on public.auth_events(created_at desc);

-- ---------- app errors ----------
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors(created_at desc);

-- ---------- subscription history ----------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_plan text,
  to_plan text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- ads ----------
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_url text,
  destination_url text not null default '',
  placement text not null default 'chat',
  priority integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- announcements & notifications (kind column) ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null default '',
  image_url text,
  link_url text,
  audience text not null default 'all' check (audience in ('all', 'free', 'plus')),
  kind text not null default 'banner' check (kind in ('banner', 'modal', 'notice')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- email templates + log ----------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subject text not null default '',
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null default '',
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- feedback (thumbs from chat UI) ----------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  chat_id text,
  model text,
  rating text not null check (rating in ('up', 'down')),
  excerpt text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback(created_at desc);

-- ---------- support tickets ----------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- app API keys (hashed, prefix only) ----------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'API key',
  key_hash text not null unique,
  prefix text not null,
  enabled boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- DB-backed models (override code registry) ----------
create table if not exists public.admin_models (
  slug text primary key,
  name text not null,
  provider text not null default 'nvidia',
  provider_model_id text not null,
  vision boolean not null default true,
  enabled boolean not null default true,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  sort integer not null default 0,
  is_default boolean not null default false
);

-- Seed code-registry models if table is empty
insert into public.admin_models (slug, name, provider, provider_model_id, vision, enabled, plan, sort, is_default)
select * from (values
  ('human-ai', 'Human AI', 'nvidia', 'meta/llama-3.2-11b-vision-instruct', true, true, 'free', 0, true),
  ('gpt-oss-20b', 'Human AI', 'nvidia', 'openai/gpt-oss-20b', false, true, 'free', 1, false),
  ('kimi-k3', 'Human AI', 'nvidia', 'moonshotai/kimi-k3', true, false, 'free', 2, false)
) as v(slug, name, provider, provider_model_id, vision, enabled, plan, sort, is_default)
where not exists (select 1 from public.admin_models);

-- ---------- feature flags ----------
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default true,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description)
values
  ('ads', true, 'Show active advertisements in the chat interface'),
  ('image_generation', true, 'Allow image uploads in chat'),
  ('new_chat_ui', true, 'Use the current chat interface'),
  ('announcements', true, 'Show announcements and notices'),
  ('feedback', true, 'Show thumbs up/down on AI answers')
on conflict (key) do nothing;

-- ---------- app settings (kv; maintenance lives here) ----------
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values
  ('maintenance', 'off'),
  ('maintenance_message', 'Human AI is briefly down for maintenance. Please check back soon.')
on conflict (key) do nothing;

-- ---------- CMS pages (override code pages when published) ----------
create table if not exists public.site_pages (
  slug text primary key,
  title text not null,
  content_md text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: deny-by-default for admin tables; public reads where needed
-- (Admin access goes through the service-role key, server-side only.)
-- ============================================================
alter table public.audit_logs enable row level security;
alter table public.auth_events enable row level security;
alter table public.app_errors enable row level security;
alter table public.subscription_events enable row level security;
alter table public.ads enable row level security;
alter table public.announcements enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_logs enable row level security;
alter table public.feedback enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.api_keys enable row level security;
alter table public.admin_models enable row level security;
alter table public.feature_flags enable row level security;
alter table public.app_settings enable row level security;
alter table public.site_pages enable row level security;

-- Public: active ads
drop policy if exists "public active ads" on public.ads;
create policy "public active ads" on public.ads
  for select using (active = true);

-- Public: active announcements/notices
drop policy if exists "public active announcements" on public.announcements;
create policy "public active announcements" on public.announcements
  for select using (active = true);

-- Public: enabled models + flags + published pages (needed by chat runtime)
drop policy if exists "public enabled models" on public.admin_models;
create policy "public enabled models" on public.admin_models
  for select using (true);

drop policy if exists "public flags" on public.feature_flags;
create policy "public flags" on public.feature_flags
  for select using (true);

drop policy if exists "public published pages" on public.site_pages;
create policy "public published pages" on public.site_pages
  for select using (published = true);

-- Users: own feedback + own tickets/messages + insert own
drop policy if exists "own feedback" on public.feedback;
create policy "own feedback" on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tickets" on public.support_tickets;
create policy "own tickets" on public.support_tickets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ticket messages" on public.support_messages;
create policy "own ticket messages" on public.support_messages
  for select using (
    exists (select 1 from public.support_tickets t
            where t.id = ticket_id and t.user_id = auth.uid())
  );

-- Realtime for admin tables (safe to re-run)
do $$
declare t text;
begin
  foreach t in array array['audit_logs','announcements','support_tickets','feedback'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

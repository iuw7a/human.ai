-- ============================================================
-- Human AI — API Lab schema (idempotent, safe to re-run)
-- Run AFTER supabase/admin_schema.sql in the Supabase SQL editor.
-- Adds: provider gateways (DB-stored keys), chat defaults,
-- per-user model grants, model usage logs.
-- ============================================================

-- ---------- provider gateways (OpenAI-compatible, keys server-side) ----------
create table if not exists public.provider_gateways (
  key text primary key,
  label text not null default '',
  base_url text not null default '',
  api_key text not null default '',
  enabled boolean not null default true,
  monthly_limit_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- seed base URLs (keys stay empty until admin pastes them in /admin/api-lab)
insert into public.provider_gateways (key, label, base_url, api_key, enabled)
values
  ('kira', 'Kira AI', 'https://kiraai.vn/api/v1', '', true),
  ('codecraft', 'CodeCraft API', 'https://codecraftapi.com/v1', '', true),
  ('bynara', 'NaraRouter', 'https://router.bynara.id/v1', '', true)
on conflict (key) do update set
  label = excluded.label,
  base_url = excluded.base_url;

-- ---------- chat defaults (global model per purpose) ----------
create table if not exists public.chat_defaults (
  purpose text primary key check (purpose in ('chat', 'image', 'code')),
  model_slug text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.chat_defaults (purpose, model_slug)
values
  ('chat', 'humi1.1-speed'),
  ('image', 'humi.1-images'),
  ('code', 'humi1.1-speed')
on conflict (purpose) do nothing;

-- ---------- per-user model grants (via admin) ----------
create table if not exists public.user_model_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_slug text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, model_slug)
);
create index if not exists user_model_grants_user_idx on public.user_model_grants(user_id);

-- ---------- model usage logs (per request) ----------
create table if not exists public.model_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  model_slug text not null default '',
  gateway_key text not null default '',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  success boolean not null default true,
  error text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists model_usage_logs_created_idx on public.model_usage_logs(created_at desc);
create index if not exists model_usage_logs_model_idx on public.model_usage_logs(model_slug);
create index if not exists model_usage_logs_gateway_idx on public.model_usage_logs(gateway_key);

-- ============================================================
-- RLS: deny-by-default; service-role only (server-side).
-- ============================================================
alter table public.provider_gateways enable row level security;
alter table public.chat_defaults enable row level security;
alter table public.user_model_grants enable row level security;
alter table public.model_usage_logs enable row level security;

-- Public read for chat defaults (chat UI needs global defaults).
drop policy if exists "public chat defaults" on public.chat_defaults;
create policy "public chat defaults" on public.chat_defaults
  for select using (true);

-- Users can read their own grants (to show "via admin" badge).
drop policy if exists "own model grants" on public.user_model_grants;
create policy "own model grants" on public.user_model_grants
  for select using (auth.uid() = user_id);

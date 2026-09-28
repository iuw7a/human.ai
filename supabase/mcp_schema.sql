-- ============================================================
-- Human AI — MCP Marketplace schema (idempotent, safe to re-run)
-- Run AFTER supabase/schema.sql in the Supabase SQL editor.
-- ============================================================

-- ---------- MCP server catalog (curated, verified entries only) ----------
create table if not exists public.mcp_servers (
  id text primary key,
  name text not null,
  description text not null default '',
  icon_url text,
  category text not null default 'Utilities',
  repository text,
  homepage text,
  server_url text,
  transport text not null default 'remote' check (transport in ('remote', 'local')),
  auth_type text not null default 'none' check (auth_type in ('none', 'api_key', 'oauth')),
  installation_md text not null default '',
  featured boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Repair columns for partial runs
alter table if exists public.mcp_servers
  add column if not exists name text,
  add column if not exists description text not null default '',
  add column if not exists icon_url text,
  add column if not exists category text not null default 'Utilities',
  add column if not exists repository text,
  add column if not exists homepage text,
  add column if not exists server_url text,
  add column if not exists transport text not null default 'remote',
  add column if not exists auth_type text not null default 'none',
  add column if not exists installation_md text not null default '',
  add column if not exists featured boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- ---------- user connections (credentials encrypted, user-isolated) ----------
create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_id text not null references public.mcp_servers(id) on delete cascade,
  status text not null default 'connected' check (status in ('connected', 'local', 'error')),
  credentials_enc text,
  server_url_override text,
  tools_cache jsonb not null default '[]'::jsonb,
  tools_cached_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, server_id)
);

alter table if exists public.mcp_connections
  add column if not exists status text not null default 'connected',
  add column if not exists credentials_enc text,
  add column if not exists server_url_override text,
  add column if not exists tools_cache jsonb not null default '[]'::jsonb,
  add column if not exists tools_cached_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create index if not exists mcp_connections_user_idx on public.mcp_connections(user_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.mcp_servers enable row level security;
alter table public.mcp_connections enable row level security;

-- Catalog is publicly readable (verified entries only, no secrets inside).
drop policy if exists "public mcp catalog" on public.mcp_servers;
create policy "public mcp catalog" on public.mcp_servers
  for select using (true);

-- Connections: strictly the owning user (service role bypasses server-side).
drop policy if exists "own mcp connections" on public.mcp_connections;
create policy "own mcp connections" on public.mcp_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime (safe to re-run)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mcp_connections'
  ) then
    alter publication supabase_realtime add table public.mcp_connections;
  end if;
end $$;

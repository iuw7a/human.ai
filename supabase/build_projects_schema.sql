-- ============================================================
-- Human AI — build projects workspace (idempotent, safe to re-run).
-- Per-user website projects: /build/[user]/[email]/[project]/...
-- Run in the Supabase SQL editor.
-- ============================================================

create table if not exists public.build_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled site',
  brief text not null default '',
  status text not null default 'draft',
  files jsonb not null default '[]'::jsonb,
  sandbox_id text not null default '',
  preview_url text not null default '',
  subdomain text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists build_projects_user_idx on public.build_projects(user_id);

-- Project-scoped API keys (optional; code falls back to name markers).
alter table public.api_keys
  add column if not exists project_id uuid references public.build_projects(id) on delete cascade;
create index if not exists api_keys_project_idx on public.api_keys(project_id);

alter table public.build_projects enable row level security;

-- Owners only (service-role bypasses for server code).
drop policy if exists "own build projects" on public.build_projects;
create policy "own build projects" on public.build_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

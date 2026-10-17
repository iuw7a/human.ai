-- ============================================================
-- Human AI — published sites (idempotent, safe to re-run).
-- User-built static sites served on <subdomain>.usehuman.de
-- Run in the Supabase SQL editor.
-- ============================================================

create table if not exists public.sites (
  subdomain text primary key check (subdomain ~ '^[a-z0-9-]{3,40}$'),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default '',
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sites_user_idx on public.sites(user_id);

alter table public.sites enable row level security;

-- Published sites are public websites: anyone may read them.
drop policy if exists "public sites read" on public.sites;
create policy "public sites read" on public.sites
  for select using (true);

-- Owners manage their own sites.
drop policy if exists "own sites write" on public.sites;
create policy "own sites write" on public.sites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

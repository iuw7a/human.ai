-- Text → Film: sandbox access links (per-link quota) + saved film projects
-- (the history panel) + "give me more" requests from visitors.
-- Apply in the Supabase SQL editor. The backend uses the service-role key, so
-- RLS is enabled with no policies (only the server can read/write).

create table if not exists public.film_links (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  token text not null,
  label text,
  enabled boolean not null default true,
  max_films integer not null default 3 check (max_films between 0 and 1000000),
  used_films integer not null default 0 check (used_films >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists film_links_created_idx on public.film_links(created_at desc);

create table if not exists public.film_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  brief text not null default '',
  duration integer not null default 30,
  plan jsonb,
  images jsonb,
  html text not null default '',
  model text,
  ok boolean not null default false,
  images_count integer not null default 0,
  scenes_count integer not null default 0,
  total_tokens integer not null default 0,
  source text not null default 'admin' check (source in ('admin', 'sandbox')),
  link_id uuid references public.film_links(id) on delete set null,
  author text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists film_projects_created_idx on public.film_projects(created_at desc);
create index if not exists film_projects_link_idx on public.film_projects(link_id, created_at desc);

create table if not exists public.film_link_requests (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.film_links(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'handled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists film_link_requests_pending_idx
  on public.film_link_requests(created_at desc) where status = 'pending';

alter table public.film_links enable row level security;
alter table public.film_projects enable row level security;
alter table public.film_link_requests enable row level security;

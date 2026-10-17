-- Build access requests and time-limited approvals.
create table if not exists public.build_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null check (char_length(trim(name)) between 2 and 80),
  message text not null check (char_length(trim(message)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  duration_days integer check (duration_days between 1 and 365),
  approved_until timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists build_access_requests_user_idx
  on public.build_access_requests(user_id, created_at desc);
create index if not exists build_access_requests_pending_idx
  on public.build_access_requests(created_at desc) where status = 'pending';
create index if not exists build_access_requests_approved_idx
  on public.build_access_requests(user_id, approved_until desc) where status = 'approved';
create unique index if not exists build_access_requests_one_pending_per_user_idx
  on public.build_access_requests(user_id) where status = 'pending';

alter table public.build_access_requests enable row level security;
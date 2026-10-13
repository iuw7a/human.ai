-- ============================================================
-- Human AI — Subscriptions, access levels & provider registry
-- Run AFTER supabase/schema.sql + supabase/admin_schema.sql.
-- Idempotent, safe to re-run.
-- ============================================================

-- ---------- 1. profiles: extend plan + subscription columns ----------
alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_source text,
  add column if not exists subscription_starts_at timestamptz,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscription_provider_ref text,
  add column if not exists subscription_granted_by uuid references auth.users(id) on delete set null;

-- Backfill status for existing rows (do not infer source).
update public.profiles
set subscription_status = case when plan = 'free' then 'free' else 'active' end
where subscription_status is null or subscription_status = 'free';

do $$
begin
  -- profiles.plan: allow pro (was free|plus only)
  if exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles drop constraint profiles_plan_check;
  end if;
  alter table public.profiles add constraint profiles_plan_check
    check (plan in ('free', 'plus', 'pro'));

  -- profiles.subscription_status
  if not exists (select 1 from pg_constraint where conname = 'profiles_subscription_status_check') then
    alter table public.profiles add constraint profiles_subscription_status_check
      check (subscription_status in ('free', 'active', 'expired', 'suspended'));
  end if;

  -- profiles.subscription_source (nullable; never inferred from plan)
  if not exists (select 1 from pg_constraint where conname = 'profiles_subscription_source_check') then
    alter table public.profiles add constraint profiles_subscription_source_check
      check (subscription_source is null or subscription_source in ('payment', 'admin_grant', 'redeem_code', 'promotion', 'external_provider'));
  end if;
exception when others then
  -- keep migration idempotent on partial runs
  null;
end $$;

-- ---------- 2. subscription_events: source/status/dates/provider/history ----------
alter table public.subscription_events
  add column if not exists source text,
  add column if not exists status text,
  add column if not exists starts_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists provider_ref text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_events_source_check') then
    alter table public.subscription_events add constraint subscription_events_source_check
      check (source is null or source in ('payment', 'admin_grant', 'redeem_code', 'promotion', 'external_provider'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_events_status_check') then
    alter table public.subscription_events add constraint subscription_events_status_check
      check (status is null or status in ('free', 'active', 'expired', 'suspended'));
  end if;
exception when others then null;
end $$;

create index if not exists subscription_events_user_idx on public.subscription_events(user_id, created_at desc);

-- ---------- 3. admin_models: min plan (free|plus|pro) + access level ----------
alter table public.admin_models
  add column if not exists access_level text not null default 'light';

do $$
declare cname text;
begin
  -- Drop the old plan check (auto-named admin_models_plan_check in most projects).
  for cname in
    select conname from pg_constraint
    where conrelid = 'public.admin_models'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%free%' and pg_get_constraintdef(oid) ilike '%plus%'
  loop
    begin
      execute format('alter table public.admin_models drop constraint %I', cname);
    exception when others then null;
    end;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'admin_models_plan_check') then
    alter table public.admin_models add constraint admin_models_plan_check
      check (plan in ('free', 'plus', 'pro'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'admin_models_access_check') then
    alter table public.admin_models add constraint admin_models_access_check
      check (access_level in ('light', 'pro', 'high', 'extra'));
  end if;
exception when others then null;
end $$;

-- Assign real access levels to the existing seeded models (no invented models).
-- light = free tier, pro = plus/pro tier, high = pro-only advanced.
update public.admin_models set access_level = 'light', plan = 'free'
where slug in ('human-ai', 'llama-3.2-11b-vision', 'gpt-oss-20b');
update public.admin_models set access_level = 'pro', plan = 'plus'
where slug = 'groq-120b';
update public.admin_models set access_level = 'high', plan = 'pro'
where slug = 'kimi-k3';

-- ---------- 4. plan -> access-level entitlements (admin-configurable) ----------
create table if not exists public.plan_access_rules (
  plan text primary key check (plan in ('free', 'plus', 'pro')),
  access_levels text[] not null default '{light}',
  updated_at timestamptz not null default now()
);

insert into public.plan_access_rules (plan, access_levels)
values
  ('free', '{light}'),
  ('plus', '{light,pro}'),
  ('pro', '{light,pro,high,extra}')
on conflict (plan) do nothing;

alter table public.plan_access_rules enable row level security;
drop policy if exists "public plan rules" on public.plan_access_rules;
create policy "public plan rules" on public.plan_access_rules
  for select using (true);

-- ---------- 5. Protect subscription columns from self-edits ----------
-- Users may edit name/avatar/email only. role/plan/status/subscription_*
-- changes are admin-only (service-role). Direct client updates attempting
-- to escalate are rejected by this trigger.
create or replace function public.protect_profile_subscription_columns()
returns trigger
language plpgsql
security definer
as $$
declare jwt_role text;
begin
  begin
    jwt_role := coalesce((auth.jwt() ->> 'role'), '');
  exception when others then
    jwt_role := '';
  end;
  if jwt_role = 'service_role' then
    return NEW;
  end if;
  if NEW.role is distinct from OLD.role
    or NEW.plan is distinct from OLD.plan
    or NEW.status is distinct from OLD.status
    or NEW.subscription_status is distinct from OLD.subscription_status
    or NEW.subscription_source is distinct from OLD.subscription_source
    or NEW.subscription_starts_at is distinct from OLD.subscription_starts_at
    or NEW.subscription_expires_at is distinct from OLD.subscription_expires_at
    or NEW.subscription_provider_ref is distinct from OLD.subscription_provider_ref
    or NEW.subscription_granted_by is distinct from OLD.subscription_granted_by
    or NEW.admin_notes is distinct from OLD.admin_notes
    or NEW.banned_at is distinct from OLD.banned_at
  then
    raise exception 'Not allowed: subscription, role and status changes require an administrator.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_profile_subscription on public.profiles;
create trigger protect_profile_subscription
  before update on public.profiles
  for each row execute function public.protect_profile_subscription_columns();

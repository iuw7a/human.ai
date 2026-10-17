-- ============================================================
-- Human AI — humi subscription plans
-- Adds the four purchasable tiers:
--   humi_elite | humi_pro | humi_extra | humi_enterprises
-- Run AFTER supabase/subscriptions_schema.sql. Idempotent, safe to re-run.
--
-- Rank order (ascending): free < plus < pro < humi_elite < humi_pro
--                         < humi_extra < humi_enterprises
--   (plus/pro are legacy values kept valid so existing rows and seeded
--    models keep working.)
-- ============================================================

-- ---------- 1. Widen the plan checks ----------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles drop constraint profiles_plan_check;
  end if;
  alter table public.profiles add constraint profiles_plan_check
    check (plan in ('free','plus','pro','humi_elite','humi_pro','humi_extra','humi_enterprises'));
exception when others then
  raise notice 'profiles_plan_check update skipped: %', sqlerrm;
end $$;

do $$
begin
  -- plan_access_rules.plan is the primary key; its inline check is auto-named.
  if exists (select 1 from pg_constraint where conname = 'plan_access_rules_plan_check') then
    alter table public.plan_access_rules drop constraint plan_access_rules_plan_check;
  end if;
  alter table public.plan_access_rules add constraint plan_access_rules_plan_check
    check (plan in ('free','plus','pro','humi_elite','humi_pro','humi_extra','humi_enterprises'));
exception when others then
  raise notice 'plan_access_rules check update skipped: %', sqlerrm;
end $$;

-- ---------- 2. Default entitlements for the new plans ----------
-- Admin-adjustable afterwards in /admin → plan rules. Monotonic by rank.
insert into public.plan_access_rules (plan, access_levels)
values
  ('humi_elite',       '{light,pro}'),
  ('humi_pro',         '{light,pro,high}'),
  ('humi_extra',       '{light,pro,high,extra}'),
  ('humi_enterprises', '{light,pro,high,extra}')
on conflict (plan) do nothing;

-- ============================================================
-- Human AI — DEV ONLY admin seed. NEVER run in production.
-- Creates two development admin logins with bcrypt-hashed passwords
-- (via pgcrypto, never plaintext) and promotes them to admin.
-- Passwords can be changed anytime in Supabase Auth or the app.
--
--   Admin.a / Admin123   (email: admin.a@human.ai)
--   admin   / admin123   (email: admin@human.ai)
-- ============================================================

create extension if not exists pgcrypto;

-- 1) auth users (skip if email already exists)
insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_sent_at, recovery_sent_at,
  is_super_admin, raw_app_meta_data, raw_user_meta_data
)
select
  gen_random_uuid(), 'authenticated', 'authenticated',
  'admin.a@human.ai', crypt('Admin123', gen_salt('bf')),
  now(), now(), now(), now(), now(),
  false, '{"provider":"email","providers":["email"]}',
  '{"name":"Admin.a"}'
where not exists (select 1 from auth.users where email = 'admin.a@human.ai');

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_sent_at, recovery_sent_at,
  is_super_admin, raw_app_meta_data, raw_user_meta_data
)
select
  gen_random_uuid(), 'authenticated', 'authenticated',
  'admin@human.ai', crypt('admin123', gen_salt('bf')),
  now(), now(), now(), now(), now(),
  false, '{"provider":"email","providers":["email"]}',
  '{"name":"admin"}'
where not exists (select 1 from auth.users where email = 'admin@human.ai');

-- 2) profiles with full admin role + plus plan
insert into public.profiles (id, name, email, role, plan, status)
select id, 'Admin.a', 'admin.a@human.ai', 'admin', 'plus', 'active'
from auth.users where email = 'admin.a@human.ai'
on conflict (id) do update set role = 'admin', plan = 'plus', status = 'active';

insert into public.profiles (id, name, email, role, plan, status)
select id, 'admin', 'admin@human.ai', 'admin', 'plus', 'active'
from auth.users where email = 'admin@human.ai'
on conflict (id) do update set role = 'admin', plan = 'plus', status = 'active';

-- Promote any existing account to admin instead (preferred for real owners):
--   update public.profiles set role = 'admin', plan = 'plus'
--   where email = 'you@example.com';

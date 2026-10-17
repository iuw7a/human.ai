-- ============================================================
-- Human AI — usage source tracking (idempotent, safe to re-run).
-- Adds source column so /admin/models/free/limit can split usage
-- between chat UI, API keys and admin tests.
-- Run in the Supabase SQL editor.
-- ============================================================
alter table public.model_usage_logs
  add column if not exists source text not null default 'unknown';

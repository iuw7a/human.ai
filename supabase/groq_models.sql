-- Groq provider model for Human AI. Run once in the Supabase SQL editor.
-- Requires GROQ_API_KEY in the server environment (.env.local / Vercel).
-- Models are managed exclusively by admins via /admin → Models.
insert into public.admin_models (slug, name, provider, provider_model_id, vision, enabled, plan, sort, is_default)
values ('groq-120b', 'Human AI', 'groq', 'openai/gpt-oss-120b', false, true, 'free', 50, false)
on conflict (slug) do update set
  provider = excluded.provider,
  provider_model_id = excluded.provider_model_id,
  enabled = excluded.enabled;

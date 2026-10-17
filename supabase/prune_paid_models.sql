-- ============================================================
-- Human AI — prune paid/card-needing gateway models (safe to re-run).
-- KEEPS only free & usable models:
--   - kira-* own models (token package, no wallet needed)
--   - NaraRouter free tier (agnes-2.5-flash, jev, laguna-s-2.1,
--     nemotron-3-ultra-free, nemotron-3.5-lightning-free — 7M/day)
--   - ALL CodeCraft (1M free/month, verified working)
--   - ALL OpenRouter :free (50/day, verified key)
--   - built-ins (humi*/NVIDIA/Groq/IFM/Agnes on server keys)
-- DELETES: Kira partner models (VND wallet empty), Nara paid
-- (credits empty), ALL Ollama Cloud (free quota exhausted).
-- Also drops grants pointing at removed models.
-- ============================================================

-- Kira partners (provider_model_id NOT starting with kira-)
delete from public.admin_models
where provider = 'kira' and provider_model_id not like 'kira-%';

-- Nara paid (keep the 5 free-tier slugs)
delete from public.admin_models
where provider = 'bynara' and slug not in (
  'bn-agnes-2-5-flash', 'bn-jev', 'bn-laguna-s-2-1',
  'bn-nemotron-3-ultra-free', 'bn-nemotron-3-5-lightning-free'
);

-- Ollama Cloud (free quota exhausted, needs Pro)
delete from public.admin_models where provider = 'ollama';

-- Orphan grants (their model is gone)
delete from public.user_model_grants
where model_slug not in (select slug from public.admin_models);

-- Safety: defaults must point at kept models (they do: humi* built-ins).
-- If a default ever dangles, reset it to humi1.1-speed:
-- update public.chat_defaults set model_slug = 'humi1.1-speed'
-- where model_slug not in (select slug from public.admin_models);

-- ============================================================
-- Human AI — API key scopes + two-model cleanup.
-- Run ONCE in the Supabase SQL editor (safe to re-run).
-- 1) api_keys.scopes: which product areas a key may call.
--    'chat'   = text models (Speed / humi1.1-speed)
--    'images' = image model (humi.1-images)
--    Existing keys default to both (no breakage).
-- 2) Only the two curated models stay enabled; legacy slugs
--    (human-ai, gpt-oss-20b, kimi-k3, ifm-k2, …) are disabled
--    (rows kept, reversible — old chats stay readable in history).
-- ============================================================

alter table public.api_keys
  add column if not exists scopes text[] not null default '{chat,images}';

update public.api_keys
  set scopes = '{chat,images}'
  where scopes is null or array_length(scopes, 1) is null;

-- Make sure the image model exists for the admin UI + API.
insert into public.admin_models (slug, name, provider, provider_model_id, vision, enabled, plan, sort, is_default)
values ('humi.1-images', 'humi.1 images', 'agnes', 'agnes-image-2.1-flash', false, true, 'free', 1, false)
on conflict (slug) do update set
  name = excluded.name,
  provider = excluded.provider,
  provider_model_id = excluded.provider_model_id,
  enabled = true;

-- Curated models on, everything else off.
update public.admin_models set enabled = true
  where slug in ('humi1.1-speed', 'humi.1-images');

update public.admin_models set enabled = false
  where slug not in ('humi1.1-speed', 'humi.1-images');

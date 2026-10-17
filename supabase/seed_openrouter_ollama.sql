-- OpenRouter (15 free) + Ollama Cloud (20) seed. Safe to re-run.
insert into public.provider_gateways (key, label, base_url, enabled)
values
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', true),
  ('ollama', 'Ollama Cloud', 'https://ollama.com/v1', true)
on conflict (key) do update set label = excluded.label, base_url = excluded.base_url;

-- 35 models.
insert into public.admin_models (slug, name, provider, provider_model_id, vision, enabled, plan, access_level, sort, is_default)
values
  ('or-nvidia-nemotron-3-ultra-550b-a55b-free', 'Nemotron 3 Ultra 550B', 'openrouter', 'nvidia/nemotron-3-ultra-550b-a55b:free', true, true, 'plus', 'pro', 300, false),
  ('or-nvidia-nemotron-3-super-120b-a12b-free', 'Nemotron 3 Super 120B', 'openrouter', 'nvidia/nemotron-3-super-120b-a12b:free', true, true, 'plus', 'pro', 301, false),
  ('or-nvidia-nemotron-3-5-super-vl-free', 'Nemotron 3.5 Super VL', 'openrouter', 'nvidia/nemotron-3.5-super-vl:free', true, true, 'plus', 'pro', 302, false),
  ('or-nvidia-nemotron-3-5-lightning-free', 'Nemotron 3.5 Lightning', 'openrouter', 'nvidia/nemotron-3.5-lightning:free', true, true, 'plus', 'pro', 303, false),
  ('or-nvidia-nemotron-3-nano-omni-30b-a3b-reasoning-free', 'Nemotron 3 Nano Omni Reasoning', 'openrouter', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', true, true, 'plus', 'pro', 304, false),
  ('or-nvidia-nemotron-3-5-content-safety-free', 'Nemotron Content Safety', 'openrouter', 'nvidia/nemotron-3.5-content-safety:free', true, true, 'plus', 'pro', 305, false),
  ('or-thinkingmachines-inkling-free', 'Inkling', 'openrouter', 'thinkingmachines/inkling:free', true, true, 'plus', 'pro', 306, false),
  ('or-thinkingmachines-inkling-small-free', 'Inkling Small', 'openrouter', 'thinkingmachines/inkling-small:free', true, true, 'plus', 'pro', 307, false),
  ('or-poolside-laguna-s-2-1-free', 'Laguna S 2.1', 'openrouter', 'poolside/laguna-s-2.1:free', true, true, 'plus', 'pro', 308, false),
  ('or-poolside-laguna-xs-2-1-free', 'Laguna XS 2.1', 'openrouter', 'poolside/laguna-xs-2.1:free', true, true, 'plus', 'pro', 309, false),
  ('or-google-gemma-4-31b-it-free', 'Gemma 4 31B', 'openrouter', 'google/gemma-4-31b-it:free', true, true, 'plus', 'pro', 310, false),
  ('or-google-gemma-4-26b-a4b-it-free', 'Gemma 4 26B', 'openrouter', 'google/gemma-4-26b-a4b-it:free', true, true, 'plus', 'pro', 311, false),
  ('or-cohere-north-mini-code-free', 'North Mini Code', 'openrouter', 'cohere/north-mini-code:free', true, true, 'plus', 'pro', 312, false),
  ('or-liquid-lfm-2-5-2-6b-free', 'LFM 2.5 2.6B', 'openrouter', 'liquid/lfm-2.5-2.6b:free', true, true, 'plus', 'pro', 313, false),
  ('or-dots-studio-dots-3-note-preview-free', 'Dots 3 Note Preview', 'openrouter', 'dots-studio/dots-3-note-preview:free', true, true, 'plus', 'pro', 314, false),
  ('ol-gpt-oss-120b', 'GPT OSS 120B', 'ollama', 'gpt-oss:120b', true, true, 'plus', 'pro', 315, false),
  ('ol-gpt-oss-20b', 'GPT OSS 20B', 'ollama', 'gpt-oss:20b', true, true, 'plus', 'pro', 316, false),
  ('ol-kimi-k3', 'Kimi K3', 'ollama', 'kimi-k3', true, true, 'plus', 'pro', 317, false),
  ('ol-kimi-k2-6', 'Kimi K2.6', 'ollama', 'kimi-k2.6', true, true, 'plus', 'pro', 318, false),
  ('ol-kimi-k2-7-code', 'Kimi K2.7 Code', 'ollama', 'kimi-k2.7-code', true, true, 'plus', 'pro', 319, false),
  ('ol-glm-5-2', 'GLM 5.2', 'ollama', 'glm-5.2', true, true, 'plus', 'pro', 320, false),
  ('ol-glm-5-3', 'GLM 5.3', 'ollama', 'glm-5.3', true, true, 'plus', 'pro', 321, false),
  ('ol-glm-5-3-flash', 'GLM 5.3 Flash', 'ollama', 'glm-5.3-flash', true, true, 'plus', 'pro', 322, false),
  ('ol-deepseek-v4-pro-0813', 'DeepSeek V4 Pro', 'ollama', 'deepseek-v4-pro:0813', true, true, 'plus', 'pro', 323, false),
  ('ol-deepseek-v4-1-flash', 'DeepSeek V4.1 Flash', 'ollama', 'deepseek-v4.1-flash', true, true, 'plus', 'pro', 324, false),
  ('ol-minimax-m3', 'MiniMax M3', 'ollama', 'minimax-m3', true, true, 'plus', 'pro', 325, false),
  ('ol-minimax-m2-7', 'MiniMax M2.7', 'ollama', 'minimax-m2.7', true, true, 'plus', 'pro', 326, false),
  ('ol-gemma4-31b', 'Gemma 4 31B', 'ollama', 'gemma4:31b', true, true, 'plus', 'pro', 327, false),
  ('ol-mistral-large-3-675b', 'Mistral Large 3 675B', 'ollama', 'mistral-large-3:675b', true, true, 'plus', 'pro', 328, false),
  ('ol-mistral-large-4', 'Mistral Large 4', 'ollama', 'mistral-large-4', true, true, 'plus', 'pro', 329, false),
  ('ol-nemotron-3-super', 'Nemotron 3 Super', 'ollama', 'nemotron-3-super', true, true, 'plus', 'pro', 330, false),
  ('ol-nemotron-3-ultra', 'Nemotron 3 Ultra', 'ollama', 'nemotron-3-ultra', true, true, 'plus', 'pro', 331, false),
  ('ol-nemotron-3-nano-30b', 'Nemotron 3 Nano 30B', 'ollama', 'nemotron-3-nano:30b', true, true, 'plus', 'pro', 332, false),
  ('ol-clef-27b', 'Clef 27B', 'ollama', 'clef:27b', true, true, 'plus', 'pro', 333, false),
  ('ol-muse-spark-open', 'Muse Spark Open', 'ollama', 'muse-spark-open', true, true, 'plus', 'pro', 334, false)
on conflict (slug) do nothing;

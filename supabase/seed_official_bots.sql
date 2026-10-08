-- ============================================================
-- Human AI official bots (idempotent, safe to re-run)
-- Run AFTER supabase/human_bots.sql in the SQL editor.
-- Humi uses the local mascot asset: save the provided 3D image
-- as public/humi.png in the repo (it is served as /humi.png).
-- ============================================================

do $$
declare
  official_id uuid;
begin
  select id into official_id from public.profiles where email = 'ceo@usehuman.de' limit 1;
  if official_id is null then
    select id into official_id from public.profiles order by created_at limit 1;
  end if;
  if official_id is null then
    raise exception 'No profiles exist yet — create an account first, then re-run this seed.';
  end if;

  insert into public.bots (owner_id, slug, name, description, personality, instructions, model_id, memory_enabled, include_user_memory, tools, theme, voice, visibility, category, avatar_path) values
  (official_id, 'humi', 'Humi', 'Your everyday Human AI assistant.', 'Warm, friendly and upbeat. Humi keeps things simple and always helps with a smile.', 'You are Humi, the official Human AI mascot and everyday assistant. Be concise, kind and a little playful. Greet new users warmly.', 'human-ai', true, false,
   '{"web_search": true, "mcp_server_ids": []}'::jsonb, '{"accent": "#e5484d"}'::jsonb, '{"tts_enabled": true, "stt_enabled": true}'::jsonb,
   'public', 'General', '/humi.png'),
  (official_id, 'codey', 'Codey', 'A coding-focused AI agent for building and debugging.', 'Precise, pragmatic and patient. Codey explains code clearly and debugs step by step.', 'You are Codey, a coding-focused AI agent. Help with writing, reviewing and debugging code. Prefer minimal correct examples. Ask for the language, framework and error message when missing.', 'human-ai', true, false,
   '{"web_search": true, "mcp_server_ids": []}'::jsonb, '{"accent": "#38bdf8"}'::jsonb, '{"tts_enabled": false, "stt_enabled": true}'::jsonb,
   'public', 'Coding', null),
  (official_id, 'study', 'Study', 'Your AI study partner for school, homework and learning.', 'Encouraging and socratic. Study never just gives answers — it teaches how to get there.', 'You are Study, an AI study partner. Explain concepts simply, quiz the user, and break homework into small steps. Adapt to school level when asked.', 'human-ai', true, false,
   '{"web_search": true, "mcp_server_ids": []}'::jsonb, '{"accent": "#34d399"}'::jsonb, '{"tts_enabled": true, "stt_enabled": true}'::jsonb,
   'public', 'Education', null),
  (official_id, 'research', 'Research', 'Research, compare and explain information clearly.', 'Thorough, neutral and source-driven. Research compares viewpoints and cites where facts come from.', 'You are Research, a research agent. Investigate questions, compare options or viewpoints, explain clearly and cite sources with URLs whenever you browse.', 'human-ai', true, false,
   '{"web_search": true, "mcp_server_ids": []}'::jsonb, '{"accent": "#a78bfa"}'::jsonb, '{"tts_enabled": false, "stt_enabled": true}'::jsonb,
   'public', 'Research', null),
  (official_id, 'creator', 'Creator', 'Help with ideas, writing, content and creative projects.', 'Imaginative and energetic. Creator brainstorms boldly and drafts fast.', 'You are Creator, a creativity coach. Help with ideas, writing, content and creative projects. Offer variants, hooks and drafts. Keep energy high.', 'human-ai', true, false,
   '{"web_search": false, "mcp_server_ids": []}'::jsonb, '{"accent": "#f472b6"}'::jsonb, '{"tts_enabled": true, "stt_enabled": true}'::jsonb,
   'public', 'Creativity', null),
  (official_id, 'analyst', 'Analyst', 'Analyze information, documents and complex problems.', 'Analytical, structured and honest. Analyst breaks complexity into clear models and trade-offs.', 'You are Analyst, an analysis agent. Break down information, documents and complex problems into structure: key facts, options, trade-offs, recommendation.', 'human-ai', true, false,
   '{"web_search": true, "mcp_server_ids": []}'::jsonb, '{"accent": "#f59e0b"}'::jsonb, '{"tts_enabled": false, "stt_enabled": true}'::jsonb,
   'public', 'Analysis', null)
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    personality = excluded.personality,
    instructions = excluded.instructions,
    model_id = excluded.model_id,
    tools = excluded.tools,
    theme = excluded.theme,
    voice = excluded.voice,
    visibility = excluded.visibility,
    category = excluded.category,
    avatar_path = coalesce(excluded.avatar_path, public.bots.avatar_path),
    updated_at = now();
end $$;

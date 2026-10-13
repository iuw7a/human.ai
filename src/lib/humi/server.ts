import type { SupabaseClient } from "@supabase/supabase-js";

/** SERVER ONLY. Humi data access with explicit owner scoping (RLS + user_id filters). */

export interface OwnAssistant {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string;
  personality: string;
  custom_instructions: string;
  language: string;
  voice: string;
  voice_enabled: boolean;
  model_id: string;
}

/** The caller's own assistant or null (never another user's — no existence leak). */
export async function getOwnAssistant(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<OwnAssistant | null> {
  const { data, error } = await supabase
    .from("humi_assistants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    name: String(r.name ?? "Humi"),
    avatar_url: String(r.avatar_url ?? ""),
    personality: String(r.personality ?? "friendly"),
    custom_instructions: String(r.custom_instructions ?? ""),
    language: String(r.language ?? "auto"),
    voice: String(r.voice ?? "server"),
    voice_enabled: r.voice_enabled !== false,
    model_id: String(r.model_id ?? "human-ai"),
  };
}

/** Chats of the caller's own assistant. Empty when the humi column is missing (setup pending). */
export async function listAssistantChats(
  supabase: SupabaseClient,
  userId: string,
  assistantId: string
): Promise<{ id: string; title: string | null; updated_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from("chats")
      .select("id,title,updated_at")
      .eq("user_id", userId)
      .eq("humi_assistant_id", assistantId)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []) as { id: string; title: string | null; updated_at: string }[];
  } catch {
    return [];
  }
}

/** True when the humi tables/columns exist (setup completed). */
export async function humiSetupOk(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await supabase.from("humi_assistants").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

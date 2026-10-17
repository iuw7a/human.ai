import { createAdminSupabase } from "./supabase/server";

export type ChatPurpose = "chat" | "image" | "code";

export async function getChatDefaults(): Promise<Record<ChatPurpose, string>> {
  const fallback: Record<ChatPurpose, string> = {
    chat: "humi1.1-speed",
    image: "humi.1-images",
    code: "humi1.1-speed",
  };
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("chat_defaults").select("purpose,model_slug");
    for (const r of (data ?? []) as { purpose: string; model_slug: string }[]) {
      if (r.purpose === "chat" || r.purpose === "image" || r.purpose === "code") {
        fallback[r.purpose as ChatPurpose] = r.model_slug;
      }
    }
  } catch {
    // table missing -> fallback
  }
  return fallback;
}

export async function setChatDefault(purpose: ChatPurpose, modelSlug: string) {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("chat_defaults")
    .upsert({ purpose, model_slug: modelSlug.slice(0, 120), updated_at: new Date().toISOString() }, { onConflict: "purpose" });
  if (error) throw error;
}

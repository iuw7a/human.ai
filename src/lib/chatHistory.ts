import type { StoredMessage } from "@/components/ChatView";
import { createServerSupabase, createAdminSupabase } from "./supabase/server";

/** Load a chat's messages for the given user (RLS-enforced), resolving
 *  stored image paths to short-lived signed URLs. SERVER ONLY. */
export async function loadChatHistory(
  chatId: string,
  userId: string
): Promise<StoredMessage[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("messages")
    .select("role,content,images,created_at")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(100);

  return Promise.all(
    (data ?? []).map(async (m) => {
      const images: { url: string; storagePath?: string }[] = [];
      for (const img of (m.images ?? []) as {
        url?: string;
        storagePath?: string;
      }[]) {
        if (img.url && img.url.startsWith("https://")) {
          images.push({ url: img.url, storagePath: img.storagePath });
        } else if (img.storagePath) {
          try {
            const admin = createAdminSupabase();
            const { data: signed } = await admin.storage
              .from("attachments")
              .createSignedUrl(img.storagePath, 3600);
            if (signed?.signedUrl) {
              images.push({ url: signed.signedUrl, storagePath: img.storagePath });
            }
          } catch {
            // image unavailable — skip
          }
        }
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content as string,
        images,
      };
    })
  );
}

/** Resolve which model slug a chat uses (stored row, else default). */
export async function resolveChatModel(
  chatId: string,
  userId: string,
  fallback: string
): Promise<string> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("chats")
    .select("model_id")
    .eq("id", chatId)
    .eq("user_id", userId)
    .single();
  return data?.model_id ?? fallback;
}

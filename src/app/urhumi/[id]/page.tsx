import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { HumiChatView } from "@/components/humi/HumiChatView";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOwnAssistant, listAssistantChats } from "@/lib/humi/server";
import { loadChatHistory } from "@/lib/chatHistory";

export const metadata = { title: "Humi chat — Human AI" };

export default async function PersonalHumiPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { chat?: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/urhumi/${params.id}`);
  }

  // Ownership enforced: foreign ids resolve to null → 404 (no existence leak).
  const assistant = await getOwnAssistant(supabase, user.id, params.id).catch(() => null);
  if (!assistant) notFound();

  const chats = await listAssistantChats(supabase, user.id, assistant.id);

  // Optional deep link ?chat=<id> — must belong to this assistant + user.
  let initialChatId: string | null = null;
  let initialMessages: { role: "user" | "assistant"; content: string; images?: { url: string }[] }[] = [];
  const wanted = typeof searchParams.chat === "string" ? searchParams.chat : null;
  if (wanted && chats.some((c) => c.id === wanted)) {
    initialChatId = wanted;
    initialMessages = await loadChatHistory(wanted, user.id).catch(() => []);
  } else if (chats.length > 0) {
    initialChatId = chats[0].id;
    initialMessages = await loadChatHistory(chats[0].id, user.id).catch(() => []);
  }

  return (
    <AppShell>
      <HumiChatView
        key={assistant.id}
        assistant={{
          id: assistant.id,
          name: assistant.name,
          avatar_url: assistant.avatar_url,
          personality: assistant.personality,
          custom_instructions: assistant.custom_instructions,
          language: assistant.language,
          voice_enabled: assistant.voice_enabled,
          model_id: assistant.model_id,
        }}
        user={user}
        initialChats={chats}
        initialChatId={initialChatId}
        initialMessages={initialMessages}
      />
    </AppShell>
  );
}

import { AppShell } from "@/components/AppShell";
import { ChatView } from "@/components/ChatView";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { loadChatHistory, resolveChatModel } from "@/lib/chatHistory";
import { createServerSupabase } from "@/lib/supabase/server";

interface PageProps {
  params: { chatId: string };
}

export default async function ChatPage({ params }: PageProps) {
  const { chatId } = params;
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let modelId = DEFAULT_MODEL_ID;
  let initialMessages: Awaited<ReturnType<typeof loadChatHistory>> = [];
  if (user) {
    modelId = await resolveChatModel(chatId, user.id, DEFAULT_MODEL_ID);
    initialMessages = await loadChatHistory(chatId, user.id);
  }

  return (
    <AppShell>
      <ChatView
        chatId={chatId}
        modelId={modelId}
        user={user}
        initialMessages={initialMessages}
        pendingKey={`humanai-pending-${chatId}`}
      />
    </AppShell>
  );
}

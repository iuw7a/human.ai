import { redirect } from "next/navigation";
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
  // Partner funnel: /chat/sham.ai.usehuman.de goes to Sham AI.
  if (chatId === "sham.ai.usehuman.de") {
    redirect("https://sham.ai.usehuman.de");
  }
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let modelId = DEFAULT_MODEL_ID;
  let initialMessages: Awaited<ReturnType<typeof loadChatHistory>> = [];
  if (user) {
    // Speed: model lookup + message history in parallel (was: 2 sequential DB round-trips).
    [modelId, initialMessages] = await Promise.all([
      resolveChatModel(chatId, user.id, DEFAULT_MODEL_ID),
      loadChatHistory(chatId, user.id),
    ]);
  }

  return (
    <AppShell>
      <ChatView
        key={chatId}
        chatId={chatId}
        modelId={modelId}
        user={user}
        initialMessages={initialMessages}
        pendingKey={`humanai-pending-${chatId}`}
      />
    </AppShell>
  );
}

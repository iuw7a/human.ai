import { redirect } from "next/navigation";

// Legacy route: /chat/[chatId]/[modelId] -> canonical /chat/[chatId].
export default function LegacyChatRedirect({
  params,
}: {
  params: { chatId: string };
}) {
  redirect(`/chat/${params.chatId}`);
}

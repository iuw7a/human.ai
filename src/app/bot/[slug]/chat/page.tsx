import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy entry: /bot/[slug]/chat maps onto the path-based thread system.
 * ?c=<id> (old links, island, desktop) redirects to the thread;
 * otherwise a brand-new chat is minted.
 */
export default function BotChatIndexPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { c?: string };
}) {
  if (searchParams.c) redirect(`/bot/${params.slug}/chat/${searchParams.c}`);
  redirect(`/bot/${params.slug}/chat/new`);
}

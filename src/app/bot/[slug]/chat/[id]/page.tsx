import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotChatView, type BotStoredMessage } from "@/components/BotChatView";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getAccessibleBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function BotChatThreadPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${params.slug}/chat/${params.id}`);

  const admin = createAdminSupabase();
  // Speed: profile + bot resolve in parallel (was: 2 sequential DB round-trips).
  const [profileRes, probe] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", user.id).single().then(
      (r) => r,
      () => ({ data: null as { plan?: string } | null })
    ),
    getAccessibleBot(params.slug, user.id),
  ]);
  const isPro = !!profileRes.data?.plan && profileRes.data.plan !== "free";
  if (!isPro) {
    return (
      <AppShell>
        <ProUpgrade context="Human Bot" />
      </AppShell>
    );
  }

  if (!probe) redirect("/");
  const bot = probe.bot;
  const isOwner = probe.owner;

  // The id must be this bot's conversation — otherwise start fresh.
  const { data: own } = await admin
    .from("bot_conversations")
    .select("id")
    .eq("id", params.id)
    .eq("bot_id", bot.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!own) redirect(`/bot/${bot.slug}/chat/new`);
  const convId = own.id as string;

  const { data: msgs } = await admin
    .from("bot_messages")
    .select("role,content,images")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(100);

  const initialMessages: BotStoredMessage[] = await Promise.all(
    (msgs ?? []).map(async (m) => {
      const images: { url: string; storagePath?: string }[] = [];
      for (const img of (m.images ?? []) as { url?: string; storagePath?: string }[]) {
        if (img.url && img.url.startsWith("https://")) {
          images.push({ url: img.url, storagePath: img.storagePath });
        } else if (img.storagePath) {
          try {
            const { data: signed } = await admin.storage
              .from("attachments")
              .createSignedUrl(img.storagePath, 3600);
            if (signed?.signedUrl) images.push({ url: signed.signedUrl, storagePath: img.storagePath });
          } catch {
            // unavailable — skip
          }
        }
      }
      return { role: m.role as "user" | "assistant", content: m.content as string, images };
    })
  );

  return (
    <AppShell>
      <BotChatView key={`${bot.slug}-${convId}`} bot={bot} user={user} conversationId={convId} initialMessages={initialMessages} isOwner={isOwner} />
    </AppShell>
  );
}

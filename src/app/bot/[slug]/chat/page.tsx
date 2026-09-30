import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotChatView, type BotStoredMessage } from "@/components/BotChatView";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function BotChatPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { c?: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${params.slug}/chat`);

  const admin = createAdminSupabase();
  let isPro = false;
  try {
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }
  if (!isPro) {
    return (
      <AppShell>
        <ProUpgrade context="Human Bot" />
      </AppShell>
    );
  }

  const { data: row } = await admin.from("bots").select("*").eq("slug", params.slug).single();
  if (!row || row.owner_id !== user.id) redirect("/bots");
  const bot = toBot(row);

  // Resolve conversation: ?c= must belong to this bot, else newest, else create.
  let convId = searchParams.c ?? "";
  if (convId) {
    const { data: own } = await admin
      .from("bot_conversations")
      .select("id")
      .eq("id", convId)
      .eq("bot_id", bot.id)
      .eq("user_id", user.id)
      .single();
    if (!own) convId = "";
  }
  if (!convId) {
    const { data: latest } = await admin
      .from("bot_conversations")
      .select("id")
      .eq("bot_id", bot.id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      redirect(`/bot/${bot.slug}/chat?c=${latest.id}`);
    }
    convId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : Math.random().toString(36).slice(2, 14);
    await admin.from("bot_conversations").insert({
      id: convId,
      bot_id: bot.id,
      user_id: user.id,
      title: "New conversation",
    });
    redirect(`/bot/${bot.slug}/chat?c=${convId}`);
  }

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
      <BotChatView bot={bot} user={user} conversationId={convId} initialMessages={initialMessages} />
    </AppShell>
  );
}

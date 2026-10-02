import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

/** GET /bot/[slug]/chat/new — mint a fresh conversation, then open it. */
export default async function BotChatNewPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${params.slug}/chat/new`);

  const admin = createAdminSupabase();
  let isPro = false;
  try {
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }
  if (!isPro) redirect("/bots");

  const { data: row } = await admin.from("bots").select("*").eq("slug", params.slug).single();
  if (!row || row.owner_id !== user.id) redirect("/bots");
  const bot = toBot(row);

  const convId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  await admin.from("bot_conversations").insert({
    id: convId,
    bot_id: bot.id,
    user_id: user.id,
    title: "New conversation",
  });
  redirect(`/bot/${bot.slug}/chat/${convId}`);
}

import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotProfile } from "@/components/bots/BotProfile";
import { createAdminSupabase } from "@/lib/supabase/server";
import { OFFICIAL_BOT_SLUGS, toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

// Top-level routes that must never resolve as a bot username.
const RESERVED = new Set([
  "",
  "api",
  "admin",
  "agent",
  "account",
  "bots",
  "bot",
  "chat",
  "chess",
  "desktop",
  "computer-use",
  "library",
  "login",
  "logout",
  "maintenance",
  "mcp",
  "memory",
  "platform",
  "plugins",
  "profile",
  "setup",
  "signup",
  "support",
  "terms",
  "_next",
  "favicon.ico",
]);

/**
 * /[username] — the public bot page (human.ai/humi, human.ai/rema).
 * Only official companions resolve here. Static routes always win
 * in Next.js, so this only fires for otherwise unknown paths.
 */
export default async function PublicBotPage({ params }: { params: { username: string } }) {
  const slug = (params.username ?? "").toLowerCase();
  if (RESERVED.has(slug) || !OFFICIAL_BOT_SLUGS.has(slug)) notFound();

  const admin = createAdminSupabase();
  const { data: row } = await admin.from("bots").select("*").eq("slug", slug).maybeSingle();
  if (!row) notFound();
  const bot = toBot(row);

  const capabilities: string[] = [];
  if (bot.tools.web_search) capabilities.push("Web Search");
  if (bot.memory_enabled) capabilities.push("Memory");
  if (bot.voice.stt_enabled) capabilities.push("Voice Input");
  if (bot.voice.tts_enabled) capabilities.push("Read Aloud");

  let conversations = 0;
  let messages = 0;
  try {
    const convs = await admin.from("bot_conversations").select("id", { count: "exact", head: true }).eq("bot_id", bot.id);
    conversations = convs.count ?? 0;
    const msgs = await admin.from("bot_messages").select("id", { count: "exact", head: true }).eq("bot_id", bot.id);
    messages = msgs.count ?? 0;
  } catch {
    // stats optional
  }

  return (
    <AppShell>
      <BotProfile bot={bot} capabilities={capabilities} stats={{ conversations, messages }} />
    </AppShell>
  );
}

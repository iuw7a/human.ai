import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotProfile } from "@/components/bots/BotProfile";
import { botCapabilities, botStats, getMarketplaceBot } from "@/lib/bots-marketplace";
import { createServerSupabase } from "@/lib/supabase/server";

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
 * /[username] — clean public URL (human.ai/humi). Static routes always win
 * in Next.js, so this only fires for otherwise unknown paths.
 */
export default async function PublicBotPage({ params }: { params: { username: string } }) {
  const slug = (params.username ?? "").toLowerCase();
  if (RESERVED.has(slug)) notFound();

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const bot = await getMarketplaceBot(slug, user?.id ?? null);
  if (!bot) notFound();

  const [stats, capabilities] = await Promise.all([botStats(bot.id), botCapabilities(bot)]);

  return (
    <AppShell>
      <BotProfile bot={bot} capabilities={capabilities} stats={stats} isOwner={bot.owner} />
    </AppShell>
  );
}

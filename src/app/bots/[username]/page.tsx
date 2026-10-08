import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotProfile } from "@/components/bots/BotProfile";
import { botCapabilities, botStats, getMarketplaceBot } from "@/lib/bots-marketplace";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** /bots/[username] — public bot profile with Start Chat. */
export default async function BotProfilePage({ params }: { params: { username: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bots/${params.username}`);

  const bot = await getMarketplaceBot(params.username, user.id);
  if (!bot) notFound();

  const [stats, capabilities] = await Promise.all([botStats(bot.id), botCapabilities(bot)]);
  const isOwner = bot.owner;

  return (
    <AppShell>
      <BotProfile bot={bot} capabilities={capabilities} stats={stats} isOwner={isOwner} />
    </AppShell>
  );
}

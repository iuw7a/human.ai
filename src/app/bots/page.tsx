import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BotCard } from "@/components/bots/BotCard";
import { listMarketplace } from "@/lib/bots-marketplace";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export default async function BotsLandingPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bots");

  const { featured, official, community, mine, favorites } = await listMarketplace(user.id);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Human AI Bots</h1>
            <p className="mt-2 text-[15px] text-zinc-400">Meet AI agents built for specific tasks.</p>
          </div>
          <Link
            href="/bots/new"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} /> Create Bot
          </Link>
        </div>

        {favorites.length > 0 && (
          <Section title="Your favorites">
            {favorites.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </Section>
        )}

        {featured.length > 0 && (
          <Section title="Featured Bots" subtitle="The most loved companions right now.">
            {featured.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </Section>
        )}

        {official.length > 0 && (
          <Section title="Human AI Official Bots" subtitle="Built and maintained by Human AI.">
            {official
              .filter((b) => !featured.some((f) => f.id === b.id))
              .map((b) => (
                <BotCard key={b.id} bot={b} />
              ))}
          </Section>
        )}

        {community.length > 0 && (
          <Section title="Community Bots" subtitle="Published by creators like you.">
            {community.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </Section>
        )}

        {mine.length > 0 && (
          <Section title="My Bots" subtitle="Companions you created.">
            {mine.slice(0, 3).map((b) => (
              <BotCard key={b.id} bot={b} showFavorite={false} />
            ))}
          </Section>
        )}
        {mine.length > 3 && (
          <Link href="/bots/mine" className="mt-3 inline-block text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
            View all your bots →
          </Link>
        )}

        {featured.length === 0 && official.length === 0 && community.length === 0 && mine.length === 0 && (
          <div className="mt-12 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
            <p className="text-lg font-semibold text-white">No bots yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
              Be the first to publish a companion — or run supabase/human_bots.sql plus the official seed to add Humi and friends.
            </p>
            <Link
              href="/bots/new"
              className="mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              <Plus size={15} /> Create Bot
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

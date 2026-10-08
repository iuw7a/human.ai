import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { MineBotRow } from "@/components/bots/MineBotRow";
import { botStats, listMarketplace } from "@/lib/bots-marketplace";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** /bots/mine — the owner's bots with edit/preview/share/analytics/delete. */
export default async function MineBotsPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bots/mine");

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

  const { mine } = await listMarketplace(user.id);
  const stats = await Promise.all(mine.map((b) => botStats(b.id)));

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">My Bots</h1>
            <p className="mt-2 text-[15px] text-zinc-400">
              {mine.length === 0 ? "You have no bots yet." : `${mine.length} companion${mine.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Link
            href="/bots/new"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} /> Create Bot
          </Link>
        </div>
        <div className="mt-6 space-y-3">
          {mine.map((b, i) => (
            <MineBotRow key={b.id} bot={b} stats={stats[i] ?? { conversations: 0, messages: 0, favorites: 0 }} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

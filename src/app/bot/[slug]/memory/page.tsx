import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotMemoryManager } from "@/components/BotMemoryManager";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function BotMemoryPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${params.slug}/memory`);

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
        <ProUpgrade context="Bot memory" />
      </AppShell>
    );
  }
  const { data: row } = await admin.from("bots").select("*").eq("slug", params.slug).single();
  if (!row || row.owner_id !== user.id) redirect("/bots");
  const bot = toBot(row);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link href={`/bot/${bot.slug}`} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
          <ArrowLeft size={13} /> Back to {bot.name}
        </Link>
        <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-widest text-accent">Memory</p>
        <h1 className="mb-1 text-2xl font-black tracking-tight text-white">What {bot.name} remembers</h1>
        <p className="mb-6 text-sm text-zinc-500">Separate from your other Bots and from normal chats.</p>
        <BotMemoryManager slug={bot.slug} memoryEnabled={bot.memory_enabled} />
      </div>
    </AppShell>
  );
}

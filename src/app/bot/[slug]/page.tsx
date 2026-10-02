import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Brain, Settings2, Monitor, SlidersHorizontal, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotAvatar } from "@/components/BotAvatar";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { botStatus, toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function BotProfilePage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${params.slug}`);

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

  const [{ data: convs }, { count: memCount }] = await Promise.all([
    admin
      .from("bot_conversations")
      .select("id,title,updated_at")
      .eq("bot_id", bot.id)
      .order("updated_at", { ascending: false })
      .limit(10),
    admin.from("bot_memories").select("id", { count: "exact", head: true }).eq("bot_id", bot.id),
  ]);

  const status = botStatus(bot);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="card overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-ink-800 via-ink-900 to-black" />
          <div className="px-6 pb-6">
            <div className="-mt-10 mb-3 flex items-end justify-between">
              <BotAvatar src={bot.avatar_url} name={bot.name} size={88} accent={bot.theme.accent} state={status === "online" ? "idle" : "idle"} />
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  status === "online"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-ink-600 bg-ink-800 text-zinc-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status === "online" ? "bg-emerald-400" : "bg-zinc-500"}`} />
                {status === "online" ? "Online" : "Idle"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">{bot.name}</h1>
            <p className="font-mono text-xs text-zinc-500">usehuman.de/bot/{bot.slug}</p>
            {bot.description && <p className="mt-2 text-[15px] leading-7 text-zinc-300">{bot.description}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span>{memCount ?? 0} memories</span>
              <span>{convs?.length ?? 0} recent conversations</span>
              <span>Active {timeAgo(bot.last_active_at ?? bot.updated_at)}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Link href={`/bot/${bot.slug}/chat`} className="btn-primary justify-center py-2.5 text-sm">
                <MessageSquare size={15} /> Chat
              </Link>
              <Link href={`/bot/${bot.slug}/memory`} className="btn-ghost justify-center border border-ink-600 py-2.5 text-sm">
                <Brain size={15} /> Memory
              </Link>
              <Link href={`/bot/${bot.slug}/customize`} className="btn-ghost justify-center border border-ink-600 py-2.5 text-sm">
                <SlidersHorizontal size={15} /> Customize
              </Link>
              <Link href={`/bot/${bot.slug}/desktop`} className="btn-ghost justify-center border border-ink-600 py-2.5 text-sm">
                <Monitor size={15} /> Desktop
              </Link>
              <Link href={`/bot/${bot.slug}/settings`} className="btn-ghost justify-center border border-ink-600 py-2.5 text-sm">
                <Settings2 size={15} /> Settings
              </Link>
            </div>
          </div>
        </div>

        <div className="card mt-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Conversations</h2>
            <Link href={`/bot/${bot.slug}/chat/new`} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
              <Plus size={13} /> New chat with {bot.name}
            </Link>
          </div>
          {(convs ?? []).length === 0 && (
            <p className="py-3 text-center text-sm text-zinc-500">No conversations yet — say hello.</p>
          )}
          <div className="space-y-1">
            {(convs ?? []).map((c) => (
              <Link
                key={c.id}
                href={`/bot/${bot.slug}/chat/${c.id}`}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-800"
              >
                <span className="truncate text-sm text-zinc-200">{c.title || "Conversation"}</span>
                <span className="shrink-0 pl-3 text-xs text-zinc-600">{timeAgo(c.updated_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

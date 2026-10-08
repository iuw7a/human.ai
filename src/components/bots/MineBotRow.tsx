"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Play, Share2, Trash2, BarChart3 } from "lucide-react";
import { BotAvatar } from "@/components/BotAvatar";
import { ShareButton } from "@/components/bots/ShareButton";
import type { MarketBot } from "@/lib/bots-marketplace";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/40 px-3 py-2.5 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}

/** Owner row: preview, edit, share, analytics, delete. */
export function MineBotRow({
  bot,
  stats,
}: {
  bot: MarketBot;
  stats: { conversations: number; messages: number; favorites: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete "${bot.name}" and all its conversations?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bots/${bot.slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-center gap-3.5">
        <BotAvatar src={bot.avatar_url} name={bot.name} size={52} accent={bot.theme.accent} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{bot.name}</p>
          <p className="truncate font-mono text-xs text-zinc-500">
            @{bot.slug} · {bot.visibility}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400">
          {bot.category}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Chats" value={stats.conversations} />
        <Stat label="Messages" value={stats.messages} />
        <Stat label="Saves" value={stats.favorites} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => router.push(`/bots/${bot.slug}/chat/new`)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          <Play size={13} /> Preview
        </button>
        <button
          onClick={() => router.push(`/bots/${bot.slug}/edit`)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-[13px] text-zinc-200 transition-colors hover:text-white"
        >
          <Pencil size={13} /> Edit
        </button>
        <ShareButton slug={bot.slug} />
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-[13px] text-zinc-500">
          <BarChart3 size={13} /> Analytics
        </span>
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] text-zinc-500 transition-colors hover:bg-accent/15 hover:text-accent disabled:opacity-50"
        >
          <Trash2 size={13} /> {busy ? "…" : "Delete"}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-zinc-600">
        <Share2 size={11} /> Public URL: /{bot.slug}
      </p>
    </article>
  );
}

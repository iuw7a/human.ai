import Link from "next/link";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { BotAvatar } from "../BotAvatar";
import type { Bot } from "@/lib/bots";

export interface BotPageStats {
  conversations: number;
  messages: number;
}

/** Public bot profile: large avatar, identity, capabilities, start chat, stats. */
export function BotProfile({
  bot,
  capabilities,
  stats,
}: {
  bot: Bot;
  capabilities: string[];
  stats: BotPageStats;
}) {
  const big = bot.slug === "humi" || bot.slug === "rema";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <div style={big ? { filter: "drop-shadow(0 24px 60px rgba(0,0,0,0.6))" } : undefined}>
          <BotAvatar src={bot.avatar_url} name={bot.name} size={big ? 168 : 120} accent={bot.theme.accent} />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{bot.name}</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">@{bot.slug}</p>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-zinc-400">
          {bot.description || "An AI companion."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
          <span className="rounded-full border border-white/10 px-2.5 py-1">{bot.category}</span>
          <span className="rounded-full border border-white/10 px-2.5 py-1">by Human AI</span>
          {capabilities.map((c) => (
            <span key={c} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
        <div className="mt-6">
          <Link
            href={`/bot/${bot.slug}/chat/new`}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-6 py-3 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Start Chat <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-2.5">
        {[
          ["Conversations", stats.conversations],
          ["Messages", stats.messages],
        ].map(([label, value]) => (
          <div
            key={label as string}
            className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] px-4 py-5 text-center"
          >
            <p className="text-2xl font-bold text-white">{value as number}</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-zinc-500">
              <MessagesSquare size={11} /> {label as string}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

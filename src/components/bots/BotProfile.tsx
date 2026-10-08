import Link from "next/link";
import { ArrowUpRight, MessagesSquare, Pencil } from "lucide-react";
import { BotAvatar } from "../BotAvatar";
import type { MarketBot } from "@/lib/bots-marketplace";
import { FavoriteButton } from "./FavoriteButton";
import { ShareButton } from "./ShareButton";

/** Public bot profile: large avatar, identity, capabilities, start chat, preview stats. */
export function BotProfile({
  bot,
  capabilities,
  stats,
  isOwner,
}: {
  bot: MarketBot;
  capabilities: string[];
  stats: { conversations: number; messages: number; favorites: number };
  isOwner: boolean;
}) {
  const big = bot.slug === "humi";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <div
          className="relative"
          style={big ? { filter: "drop-shadow(0 24px 60px rgba(0,0,0,0.6))" } : undefined}
        >
          <BotAvatar src={bot.avatar_url} name={bot.name} size={big ? 168 : 120} accent={bot.theme.accent} />
          {bot.official && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
              Official
            </span>
          )}
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{bot.name}</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">@{bot.slug}</p>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-zinc-400">
          {bot.description || "An AI companion."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
          <span className="rounded-full border border-white/10 px-2.5 py-1">{bot.category}</span>
          <span className="rounded-full border border-white/10 px-2.5 py-1">by {bot.creator}</span>
          {capabilities.map((c) => (
            <span key={c} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href={`/bot/${bot.slug}/chat/new`}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-6 py-3 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Start Chat <ArrowUpRight size={17} />
          </Link>
          <FavoriteButton slug={bot.slug} initial={bot.favorite} />
          <ShareButton slug={bot.slug} />
          {isOwner && (
            <Link
              href={`/bots/${bot.slug}/edit`}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:text-white"
            >
              <Pencil size={14} /> Edit
            </Link>
          )}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-2.5">
        {[
          ["Conversations", stats.conversations],
          ["Messages", stats.messages],
          ["Saves", stats.favorites],
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


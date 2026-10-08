import Link from "next/link";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { BotAvatar } from "../BotAvatar";
import type { MarketBot } from "@/lib/bots-marketplace";
import { FavoriteButton } from "./FavoriteButton";

/** Premium marketplace bot card. Real data only. */
export function BotCard({ bot, showFavorite = true }: { bot: MarketBot; showFavorite?: boolean }) {
  return (
    <article className="group flex flex-col rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:border-white/[0.14]">
      <div className="flex items-start gap-3.5">
        <Link href={`/bots/${bot.slug}`} aria-label={bot.name}>
          <BotAvatar src={bot.avatar_url} name={bot.name} size={56} accent={bot.theme.accent} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/bots/${bot.slug}`} className="truncate text-[15px] font-semibold text-white hover:underline">
              {bot.name}
            </Link>
            {bot.official && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                Official
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-zinc-500">@{bot.slug}</p>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-zinc-400">
            {bot.description || "An AI companion."}
          </p>
        </div>
        {showFavorite && <FavoriteButton slug={bot.slug} initial={bot.favorite} />}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
        <span className="rounded-full border border-white/10 px-2 py-0.5">{bot.category}</span>
        <span className="truncate">by {bot.creator}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          <MessagesSquare size={11} />
          {bot.conversations}
        </span>
      </div>
      <Link
        href={`/bot/${bot.slug}/chat/new`}
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Start Chat <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}


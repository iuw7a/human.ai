"use client";

import { Bot } from "lucide-react";

export type BotAvatarState = "idle" | "listening" | "thinking" | "responding" | "working" | "attention";

/** Bot avatar with subtle state ring. Falls back to a Bot glyph when no image. */
export function BotAvatar({
  src,
  name,
  state = "idle",
  size = 72,
  accent = "#e5484d",
}: {
  src: string | null;
  name: string;
  state?: BotAvatarState;
  size?: number;
  accent?: string;
}) {
  const ring: Record<BotAvatarState, string> = {
    idle: "ring-ink-700",
    listening: "ring-emerald-500",
    thinking: "ring-accent animate-pulse",
    responding: "ring-accent",
    working: "ring-amber-400 animate-pulse",
    attention: "ring-accent animate-pulse",
  };
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 ring-2 ${ring[state]}`}
      style={{ width: size, height: size, ["--tw-ring-color" as string]: state === "idle" ? undefined : accent }}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <Bot size={Math.round(size * 0.45)} className="text-zinc-500" />
      )}
      {state === "thinking" || state === "working" ? (
        <span className="absolute inset-0 rounded-full bg-accent/10" />
      ) : null}
    </span>
  );
}

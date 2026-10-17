"use client";

import { Sparkles, ImagePlus, Video, Users2, Trash2 } from "lucide-react";
import { MascotAvatar } from "@/components/ai/MascotAvatar";

interface TeamPresenceBannerProps {
  onSelectTarget: (target: "humi" | "rema" | "team") => void;
  onOpenMarketingModal: () => void;
  onOpenMediaModal: (type: "image" | "video") => void;
  onClearChat?: () => void;
  activeTarget: string;
  isSending?: boolean;
}

export function TeamPresenceBanner({
  onSelectTarget,
  onOpenMarketingModal,
  onOpenMediaModal,
  onClearChat,
  activeTarget,
  isSending,
}: TeamPresenceBannerProps) {
  return (
    <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-white/[0.08] bg-black/60 px-4 sm:px-6 backdrop-blur-xl z-20">
      {/* Left: Interactive Humi & Rema Presence Pills */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Humi Pill */}
        <button
          type="button"
          onClick={() => onSelectTarget("humi")}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
            activeTarget === "humi"
              ? "border-cyan-500/60 bg-cyan-950/40 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)]"
              : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-500/30 hover:bg-white/[0.06]"
          }`}
          title="Click to summon Humi (@humi)"
        >
          <div className="relative shrink-0">
            <MascotAvatar
              status={isSending && activeTarget === "humi" ? "thinking" : "idle"}
              size={24}
              accent="#06b6d4"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
          </div>
          <span className="text-xs font-semibold">Humi</span>
          <span className="hidden sm:inline text-[10px] text-cyan-400/80 font-mono">@humi</span>
        </button>

        {/* Rema Pill */}
        <button
          type="button"
          onClick={() => onSelectTarget("rema")}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all ${
            activeTarget === "rema"
              ? "border-accent/60 bg-accent/20 text-white shadow-[0_0_15px_rgba(229,72,77,0.25)]"
              : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-accent/30 hover:bg-white/[0.06]"
          }`}
          title="Click to summon Rema (@rema)"
        >
          <div className="relative shrink-0">
            <MascotAvatar
              status={isSending && activeTarget === "rema" ? "generating" : "idle"}
              size={24}
              accent="#e5484d"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_4px_#e5484d]" />
          </div>
          <span className="text-xs font-semibold">Rema</span>
          <span className="hidden sm:inline text-[10px] text-accent/80 font-mono">@rema</span>
        </button>

        {/* Team Collaboration Pill */}
        <button
          type="button"
          onClick={() => onSelectTarget("team")}
          className={`hidden md:flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
            activeTarget === "team"
              ? "border-white/30 bg-white/15 text-white font-bold"
              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          }`}
          title="Both Humi and Rema collaborate"
        >
          <Users2 size={13} />
          <span>@team</span>
        </button>
      </div>

      {/* Right: Quick Action Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenMarketingModal}
          className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent-hover hover:scale-[1.02] active:scale-95"
          title="Create a fresh non-repetitive marketing post for usehuman.de"
        >
          <Sparkles size={13} />
          <span className="hidden sm:inline">Create Post</span>
        </button>

        <button
          onClick={() => onOpenMediaModal("image")}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-white/[0.07] hover:text-white"
          title="Agnes Image Generation"
        >
          <ImagePlus size={13} />
          <span className="hidden md:inline">Image</span>
        </button>

        <button
          onClick={() => onOpenMediaModal("video")}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-white/[0.07] hover:text-white"
          title="Agnes Video Generation"
        >
          <Video size={13} />
          <span className="hidden md:inline">Video</span>
        </button>

        {onClearChat && (
          <button
            onClick={onClearChat}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-400 hover:bg-white/[0.07] hover:text-white transition-all ml-1"
            title="Clear current session messages"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </header>
  );
}

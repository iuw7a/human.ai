"use client";

import { memo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { Markdown } from "../Markdown";
import { MascotAvatar } from "./MascotAvatar";
import { BotAvatar } from "../BotAvatar";
import type { AIStatus } from "./types";

const enter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function imagesEqual(
  a?: { url: string }[],
  b?: { url: string }[]
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((img, i) => img.url === b[i].url);
}

export interface SpeakState {
  supported: boolean;
  speaking: boolean;
}

export const UserMessage = memo(function UserMessage({
  content,
  images,
}: {
  content: string;
  images?: { url: string }[];
}) {
  return (
    <motion.div {...enter} transition={{ duration: 0.25, ease: "easeOut" }} className="flex justify-end">
      <div className="max-w-[88%] rounded-[22px] rounded-br-lg border border-white/[0.07] bg-[#15151b] px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)] sm:max-w-[80%]">
        {images && images.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {images.map((img, j) =>
              img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={j}
                  src={img.url}
                  alt={`Attachment ${j + 1}`}
                  className="h-32 w-32 rounded-2xl border border-white/10 object-cover"
                />
              ) : null
            )}
          </div>
        )}
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">{content}</p>
      </div>
    </motion.div>
  );
}, (prev, next) => prev.content === next.content && imagesEqual(prev.images, next.images));

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable
        }
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
      aria-label="Copy answer"
      title="Copy"
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

function VoteButtons({ chatId, modelId, excerpt }: { chatId: string; modelId: string; excerpt: string }) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  async function vote(rating: "up" | "down") {
    setVoted(rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, model: modelId, rating, excerpt: excerpt.slice(0, 500) }),
      });
    } catch {
      // feedback is optional
    }
  }
  const cls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.07] ${
      active ? "text-accent" : "text-zinc-500 hover:text-zinc-200"
    }`;
  return (
    <>
      <button onClick={() => vote("up")} className={cls(voted === "up")} aria-label="Good answer" title="Good answer">
        <ThumbsUp size={14} />
      </button>
      <button onClick={() => vote("down")} className={cls(voted === "down")} aria-label="Bad answer" title="Bad answer">
        <ThumbsDown size={14} />
      </button>
    </>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  content,
  streaming,
  avatarStatus = "idle",
  avatarSize = 36,
  avatarPhoto,
  speak,
  onToggleSpeak,
  vote,
}: {
  content: string;
  streaming?: boolean;
  avatarStatus?: AIStatus;
  avatarSize?: number;
  /** Bot photo instead of the mascot (bot contexts show the Bild). */
  avatarPhoto?: { src: string | null; name: string; accent?: string } | null;
  speak?: SpeakState | null;
  onToggleSpeak?: (text: string) => void;
  vote?: { chatId: string; modelId: string } | null;
}) {
  const avatar = avatarPhoto ? (
    <BotAvatar src={avatarPhoto.src} name={avatarPhoto.name} size={avatarSize} accent={avatarPhoto.accent} />
  ) : (
    <MascotAvatar status={streaming ? "generating" : avatarStatus} size={avatarSize} />
  );
  return (
    <motion.div
      {...enter}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex gap-3.5 sm:gap-4"
    >
      <div className="shrink-0 pt-1">
        {avatar}
      </div>
      <div className="min-w-0 flex-1 rounded-[22px] rounded-tl-lg border border-white/[0.06] bg-white/[0.025] px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        {streaming ? (
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
            {content}
            <span className="ml-1 inline-block h-4 w-[7px] animate-pulse rounded-sm bg-accent align-middle" />
          </p>
        ) : (
          <Markdown content={content} />
        )}
        {!streaming && (
          <div className="mt-2.5 flex items-center gap-1">
            <CopyButton text={content} />
            {speak?.supported && onToggleSpeak && (
              <button
                onClick={() => onToggleSpeak(content)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.07] hover:text-zinc-200"
                aria-label={speak.speaking ? "Stop speaking" : "Read aloud"}
                title={speak.speaking ? "Stop speaking" : "Read aloud"}
              >
                {speak.speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
            {vote && <VoteButtons chatId={vote.chatId} modelId={vote.modelId} excerpt={content} />}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export function ThinkingRow({ label = "Thinking…", avatar }: { label?: string; avatar?: React.ReactNode }) {
  const reduce = useReducedMotion();
  void reduce;
  return (
    <motion.div {...enter} transition={{ duration: 0.25 }} className="flex items-center gap-3.5 sm:gap-4" aria-label={label}>
      <div className="shrink-0">
        {avatar ?? <MascotAvatar status="thinking" size={36} />}
      </div>
      <div className="flex items-center gap-2.5 rounded-[22px] rounded-tl-lg border border-white/[0.06] bg-white/[0.025] px-5 py-4">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-zinc-500"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1, 0.85] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </span>
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
    </motion.div>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Markdown } from "../Markdown";

const enter = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function UserMessage({
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
}

export function AssistantMessage({
  content,
  avatar,
  actions,
  streaming,
}: {
  content: string;
  avatar: React.ReactNode;
  actions?: React.ReactNode;
  streaming?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      {...enter}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex gap-3.5 sm:gap-4"
    >
      <div className="shrink-0 pt-1">{avatar}</div>
      <div className="min-w-0 flex-1 rounded-[22px] rounded-tl-lg border border-white/[0.06] bg-white/[0.025] px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        <Markdown content={content} />
        {streaming && <span className="ml-1 inline-block h-4 w-[7px] animate-pulse rounded-sm bg-accent align-middle" />}
        {actions && !streaming && <div className="mt-2.5 flex items-center gap-1">{actions}</div>}
      </div>
    </motion.div>
  );
}

export function ThinkingRow({ avatar, label = "Thinking…" }: { avatar: React.ReactNode; label?: string }) {
  return (
    <motion.div {...enter} transition={{ duration: 0.25 }} className="flex items-center gap-3.5 sm:gap-4" aria-label={label}>
      <div className="shrink-0">{avatar}</div>
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

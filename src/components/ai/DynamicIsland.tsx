"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { STATUS_LABEL, isActiveStatus, type AIStatus } from "./types";
import { StatusIndicator } from "./StatusIndicator";

const ACCENT = "#e5484d";

function statusColor(s: AIStatus): string {
  switch (s) {
    case "listening":
    case "completed":
      return "#34d399";
    case "working":
    case "searching":
      return "#f59e0b";
    case "thinking":
    case "generating":
    case "speaking":
      return ACCENT;
    default:
      return "#52525b";
  }
}

/**
 * Floating Dynamic Island driven by REAL app status (not demo animation).
 * Collapsed pill when idle/completed; smoothly expands while the AI works.
 */
export function DynamicIsland({
  status,
  text,
  avatar,
}: {
  status: AIStatus;
  /** Optional override label (e.g. live agent step text). Defaults to status label. */
  text?: string;
  /** Optional small avatar node shown at the left of the pill. */
  avatar?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const active = isActiveStatus(status);
  const label = text ?? STATUS_LABEL[status];
  const color = statusColor(status);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4 sm:top-4">
      <motion.div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 overflow-hidden rounded-full border border-white/[0.08] bg-black/70 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={active ? { boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 24px ${color}33` } : undefined}
        initial={false}
        animate={{
          height: active ? 44 : 36,
          paddingLeft: active ? 10 : 14,
          paddingRight: active ? 18 : 14,
        }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 380, damping: 32 }
        }
      >
        {avatar ?? <StatusIndicator status={status} size={8} />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={label}
            className="whitespace-nowrap text-[13px] font-medium tracking-tight text-zinc-100"
            initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, y: -6, filter: "blur(3px)" }}
            transition={{ duration: 0.18 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
        {status === "thinking" || status === "searching" || status === "working" ? (
          <span className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1 w-1 rounded-full"
                style={{ background: color }}
                animate={reduce ? undefined : { opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </span>
        ) : null}
        {status === "listening" ? (
          <span className="flex h-3.5 items-center gap-[2px]" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="w-[2.5px] rounded-full"
                style={{ background: color }}
                animate={reduce ? undefined : { height: ["30%", "100%", "45%", "85%", "30%"] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </span>
        ) : null}
      </motion.div>
    </div>
  );
}

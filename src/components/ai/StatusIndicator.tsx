"use client";

import { motion } from "framer-motion";
import type { AIStatus } from "./types";

const DOT: Record<AIStatus, string> = {
  idle: "#52525b",
  thinking: "#e5484d",
  searching: "#f59e0b",
  generating: "#e5484d",
  listening: "#34d399",
  speaking: "#e5484d",
  working: "#f59e0b",
  completed: "#34d399",
};

export function StatusIndicator({ status, size = 8 }: { status: AIStatus; size?: number }) {
  const active = status !== "idle";
  return (
    <motion.span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: DOT[status] }}
      animate={active ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
      transition={{ duration: 1.2, repeat: active ? Infinity : 0, ease: "easeInOut" }}
    />
  );
}

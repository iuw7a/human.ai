"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AIStatus } from "./types";

/**
 * Black mascot avatar (stays black by design). Reacts to real AI status
 * with subtle premium motion: breathing + blink when idle, gentle rock
 * when thinking, echo rings when listening, bouncing smile when speaking,
 * happy pop when completed. Accent is used for glow only, never the body.
 */
export function MascotAvatar({
  status,
  size = 88,
  accent = "#e5484d",
}: {
  status: AIStatus;
  size?: number;
  accent?: string;
}) {
  const reduce = useReducedMotion();
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3600);
    return () => clearInterval(t);
  }, [reduce]);

  const glow =
    status === "listening" || status === "completed"
      ? "#34d399"
      : status === "working" || status === "searching"
        ? "#f59e0b"
        : accent;
  const active = status !== "idle";

  const faceAnimate = reduce
    ? undefined
    : status === "speaking"
      ? { y: [0, -3, 0] }
      : status === "generating"
        ? { y: [0, -2, 0] }
        : status === "thinking" || status === "working" || status === "searching"
          ? { rotate: [0, -2.5, 2.5, 0] }
          : undefined;
  const faceTransition = reduce
    ? undefined
    : status === "speaking"
      ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" as const }
      : status === "generating"
        ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" as const }
        : { duration: 2.2, repeat: Infinity, ease: "easeInOut" as const };

  const smileAnimate = reduce
    ? undefined
    : status === "speaking"
      ? { scaleY: [1, 1.8, 1] }
      : status === "completed"
        ? { scaleY: [1, 1.5, 1] }
        : { scaleY: 1 };

  return (
    <motion.div
      key={status}
      className="relative shrink-0"
      style={{ width: size, height: size * 0.96 }}
      initial={reduce ? false : status === "completed" ? { scale: 0.94 } : { scale: 1 }}
      animate={
        reduce
          ? undefined
          : status === "idle"
            ? { scale: [1, 1.025, 1] }
            : status === "completed"
              ? { scale: [0.94, 1.06, 1] }
              : { scale: 1.02 }
      }
      transition={
        status === "idle"
          ? { duration: 4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.45, ease: "easeOut" }
      }
    >
      {status === "listening" && !reduce && (
        <>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-[28%]"
              style={{ border: `1.5px solid ${glow}` }}
              initial={{ opacity: 0.7, scale: 1 }}
              animate={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
        </>
      )}
      <motion.div
        className="absolute inset-0"
        style={{
          filter: active ? `drop-shadow(0 0 ${size * 0.22}px ${glow}55)` : undefined,
        }}
        animate={faceAnimate}
        transition={faceTransition}
      >
        <svg viewBox="0 0 100 96" width="100%" height="100%" aria-hidden="true">
          <rect x="1" y="1" width="98" height="94" rx="28" fill="#050506" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
          <motion.g
            animate={{ scaleY: blink ? 0.08 : status === "listening" ? 1.1 : 1 }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: "50px 46px" }}
          >
            <rect x="28" y="34" width="16" height="24" rx="8" fill="#fff" />
            <rect x="56" y="34" width="16" height="24" rx="8" fill="#fff" />
          </motion.g>
          <motion.g
            animate={smileAnimate}
            transition={status === "speaking" ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
            style={{ transformOrigin: "50px 66px" }}
          >
            <path d="M 35,62 Q 50,70 65,62" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
          </motion.g>
        </svg>
      </motion.div>
    </motion.div>
  );
}

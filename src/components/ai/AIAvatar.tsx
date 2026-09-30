"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { AIStatus } from "./types";

const ACCENT = "#e5484d";

function statusColor(s: AIStatus): string {
  switch (s) {
    case "listening":
      return "#34d399";
    case "working":
    case "searching":
      return "#f59e0b";
    case "thinking":
    case "generating":
    case "speaking":
      return ACCENT;
    case "completed":
      return "#34d399";
    default:
      return "#52525b";
  }
}

/**
 * AI identity avatar. Reacts to real status: breathing idle, spinning
 * thinking ring, pulsing listening rings, waveform when speaking,
 * orbiting dot when working, check flash when completed.
 */
export function AIAvatar({
  status,
  size = 72,
  imageSrc,
  name = "Human AI",
  accent = ACCENT,
}: {
  status: AIStatus;
  size?: number;
  imageSrc?: string | null;
  name?: string;
  accent?: string;
}) {
  const reduce = useReducedMotion();
  const color = status === "idle" || status === "completed" ? accent : statusColor(status);
  const active = status !== "idle";
  const initial = (name.trim()[0] ?? "H").toUpperCase();

  return (
    <div className="relative" style={{ width: size, height: size }} aria-label={name} role="img">
      {/* listening echo rings */}
      {status === "listening" && !reduce && (
        <>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full"
              style={{ border: `1.5px solid ${color}` }}
              initial={{ opacity: 0.7, scale: 1 }}
              animate={{ opacity: 0, scale: 1.65 }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
        </>
      )}
      {/* thinking spinner ring */}
      {(status === "thinking" || status === "searching") && (
        <motion.span
          className="absolute rounded-full"
          style={{
            inset: -size * 0.08,
            border: "2px solid transparent",
            borderTopColor: color,
            borderRightColor: `${color}55`,
          }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      )}
      {/* working orbit dot */}
      {status === "working" && (
        <motion.span
          className="absolute inset-0"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <span
            className="absolute left-1/2 top-0 h-[8%] w-[8%] rounded-full"
            style={{ background: color, transform: "translate(-50%, -50%)", boxShadow: `0 0 12px ${color}` }}
          />
        </motion.span>
      )}
      {/* core */}
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-full bg-[#101014]"
        style={{
          border: `1px solid rgba(255,255,255,0.09)`,
          boxShadow: active ? `0 0 ${size * 0.5}px ${color}44, 0 12px 40px rgba(0,0,0,0.55)` : `0 12px 40px rgba(0,0,0,0.55)`,
        }}
        animate={
          reduce
            ? undefined
            : status === "idle"
              ? { scale: [1, 1.03, 1] }
              : status === "completed"
                ? { scale: [1, 1.12, 1] }
                : { scale: 1 }
        }
        transition={
          status === "idle"
            ? { duration: 4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.45, ease: "easeOut" }
        }
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={name} className="h-full w-full object-cover" />
        ) : status === "speaking" && !reduce ? (
          <div className="flex h-full w-full items-center justify-center gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="w-[3px] rounded-full"
                style={{ background: color }}
                animate={{ height: ["30%", "75%", "35%", "65%", "30%"] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
          </div>
        ) : status === "completed" ? (
          <div className="flex h-full w-full items-center justify-center text-xl font-bold" style={{ color }}>
            ✓
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <motion.span
              className="font-semibold text-white"
              style={{ fontSize: size * 0.38 }}
              animate={reduce ? undefined : status === "thinking" || status === "generating" ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            >
              {initial}
            </motion.span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

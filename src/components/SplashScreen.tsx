"use client";

import { useEffect, useState } from "react";
import { BotAvatar } from "./BotAvatar";

/** Total visible time: ~3.6s, then auto-continues. */
const DISPLAY_MS = 3600;
const FADE_MS = 3200;

const CAPABILITIES = ["Chat", "Images", "Video", "Voice", "Memory"] as const;

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), FADE_MS);
    const done = window.setTimeout(onDone, DISPLAY_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="About Human AI"
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050506] transition-opacity duration-300 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Restrained ambience: one glow, two hairlines */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-72 w-[36rem] max-w-none -translate-x-1/2 rounded-full bg-[#e5484d]/[0.07] blur-[110px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e5484d]/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#e5484d]/40 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md px-6 py-8 sm:max-w-lg">
        {/* Brand */}
        <div className="splash-rise flex flex-col items-center text-center" style={{ animationDelay: "0ms" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Human AI logo"
            width={56}
            height={56}
            className="h-14 w-14 rounded-2xl object-cover shadow-[0_8px_32px_rgba(229,72,77,0.35)] ring-1 ring-[#e5484d]/40"
          />
          <h1 className="mt-4 text-xl font-semibold tracking-[0.28em] text-white sm:text-2xl">
            HUMAN <span className="text-[#e5484d]">AI</span>
          </h1>
          <p className="mt-1.5 text-xs tracking-wide text-zinc-500">
            Built by <span className="text-zinc-300">Abdulrahman Alshouly</span>
          </p>
        </div>

        {/* The team: two real companions, not feature soup */}
        <div className="mt-7 grid grid-cols-2 gap-3">
          <div
            className="splash-rise rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"
            style={{ animationDelay: "200ms" }}
          >
            <BotAvatar src="/humi.png" name="Humi" size={44} />
            <p className="mt-2.5 text-sm font-semibold text-white">Humi</p>
            <p className="mt-0.5 text-xs leading-5 text-zinc-400">
              Your personal companion. Fast answers, remembers you, talks and listens.
            </p>
          </div>
          <div
            className="splash-rise rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"
            style={{ animationDelay: "350ms" }}
          >
            <BotAvatar src="/rema.png" name="Rema" size={44} accent="#f472b6" />
            <p className="mt-2.5 text-sm font-semibold text-white">Rema</p>
            <p className="mt-0.5 text-xs leading-5 text-zinc-400">
              The second companion. Ideas, words and creative sparks.
            </p>
          </div>
        </div>

        {/* Concrete capabilities, one line */}
        <p
          className="splash-rise mt-5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-600"
          style={{ animationDelay: "500ms" }}
        >
          {CAPABILITIES.join("  ·  ")}
        </p>

        {/* Progress — fills over the display duration, then auto-continues */}
        <div className="mt-5" aria-hidden="true">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
            <div className="splash-progress h-full rounded-full bg-gradient-to-r from-[#a02a2e] via-[#e5484d] to-[#f2555a]" />
          </div>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="mx-auto mt-5 block text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          Skip →
        </button>
      </div>

      <style>{`
        @keyframes splash-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .splash-rise {
          opacity: 0;
          animation: splash-rise 0.45s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
        }
        @keyframes splash-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .splash-progress {
          animation: splash-progress ${FADE_MS}ms linear forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-rise { opacity: 1; animation: none; }
          .splash-progress { animation-duration: 0.01ms; }
        }
      `}</style>
    </div>
  );
}

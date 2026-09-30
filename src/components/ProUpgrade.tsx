"use client";

import { Crown, Check, Bot } from "lucide-react";

/** Polished paywall shown to Free users wherever Human Bot lives. */
export function ProUpgrade({ context = "Human Bot" }: { context?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-black px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-accent/30 bg-ink-900 p-8 text-center shadow-[0_0_60px_rgba(229,72,77,0.15)] sm:p-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent/15 text-accent">
          <Bot size={30} />
        </span>
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
          <Crown size={13} /> PRO FEATURE
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {context} is Pro
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-zinc-400">
          Create your own persistent AI companions — with their own identity, memory,
          avatar and a floating desktop companion. Free accounts can look, but only
          Pro members can build and talk to Bots.
        </p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {[
            "Your own Bots with name, avatar & personality",
            "Persistent memory per Bot",
            "Floating Human Bot Desktop companion",
            "Voice interaction on desktop",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <Check size={16} className="mt-0.5 shrink-0 text-accent" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <a href="/platform" className="btn-primary px-6 py-2.5 text-sm">
            <Crown size={15} /> Upgrade to Pro
          </a>
          <a href="/" className="btn-ghost border border-ink-600 px-6 py-2.5 text-sm">
            Back to Human AI
          </a>
        </div>
      </div>
    </div>
  );
}

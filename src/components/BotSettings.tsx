"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "@/lib/bots";

const ACCENTS = ["#e5484d", "#f2555a", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];

export function BotSettings({ bot }: { bot: Bot }) {
  const router = useRouter();
  const [accent, setAccent] = useState(bot.theme.accent);
  const [tts, setTts] = useState(bot.voice.tts_enabled);
  const [stt, setStt] = useState(bot.voice.stt_enabled);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/bots/${bot.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: { accent }, voice: { tts_enabled: tts, stt_enabled: stt } }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) setError(j?.error ?? "Could not save.");
    else {
      setSaved(true);
      router.refresh();
    }
    setBusy(false);
  }

  async function destroy() {
    const res = await fetch(`/api/bots/${bot.slug}`, { method: "DELETE" });
    if (res.ok) router.push("/bots");
    else setError("Could not delete Bot.");
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}
      {saved && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">Saved.</p>}

      <div className="card flex items-center gap-4 p-5">
        <BotAvatar src={bot.avatar_url} name={bot.name} size={56} accent={accent} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{bot.name}</p>
          <p className="truncate font-mono text-xs text-zinc-500">/bot/{bot.slug} · Bot ID cannot be changed</p>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-white">Appearance</h2>
        <div className="flex items-center gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAccent(c)}
              aria-label={c}
              className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${accent === c ? "ring-2 ring-white ring-offset-2 ring-offset-ink-900" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" title="Custom accent" />
        </div>
        <p className="text-xs text-zinc-500">Change the avatar anytime in Customize.</p>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white">Voice</h2>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} className="accent-[#e5484d]" />
          Read answers aloud (Desktop companion)
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={stt} onChange={(e) => setStt(e.target.checked)} className="accent-[#e5484d]" />
          Voice input (Desktop companion, when available)
        </label>
        <p className="text-xs text-zinc-500">Voice lives in the Desktop companion (Windows speech). Web chat is text for now.</p>
      </div>

      <button onClick={save} disabled={busy} className="btn-primary px-6 py-2.5 text-sm">
        {busy ? "Saving…" : "Save settings"}
      </button>

      <div className="card border-accent/30 p-5">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-300">
          <AlertTriangle size={15} /> Danger zone
        </h2>
        {!confirming ? (
          <div>
            <p className="mt-1 text-[13px] text-zinc-500">Delete {bot.name} with all conversations and memories.</p>
            <button onClick={() => setConfirming(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-accent/40 px-4 py-2 text-xs font-medium text-red-300 hover:bg-accent/10">
              <Trash2 size={13} /> Delete Bot
            </button>
          </div>
        ) : (
          <div>
            <p className="mt-1 text-[13px] text-zinc-300">Really delete <b>{bot.name}</b>? This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={destroy} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover">
                Yes, delete
              </button>
              <button onClick={() => setConfirming(false)} className="btn-ghost border border-ink-600 px-4 py-2 text-xs">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

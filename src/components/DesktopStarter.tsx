"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Monitor, Loader2, ArrowRight, ShieldAlert } from "lucide-react";
import { ModeSelector } from "./ModeSelector";

export function DesktopStarter({ initialGoal = "" }: { initialGoal?: string }) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim() || busy) return;
    if (!consent) {
      setError("Please confirm that the agent may control this computer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-desktop/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), consent: true }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status}).`);
      router.push(`/computer-use/${j.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {error && (
        <p className="mb-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">
          {error}
        </p>
      )}
      <form
        onSubmit={start}
        className="rounded-[20px] border border-ink-600 bg-ink-900/95 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm focus-within:ring-1 focus-within:ring-accent/40"
      >
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={2}
          placeholder="Describe the computer task, e.g. Open Notepad and write a shopping list…"
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <label className="mt-1 flex cursor-pointer items-start gap-2 px-2 text-[13px] leading-5 text-zinc-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 accent-[#e5484d]"
          />
          <span className="inline-flex items-start gap-1.5">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-accent" />
            I allow the Human AI Agent to move the mouse, click and type on THIS computer until I stop it.
          </span>
        </label>
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:inline-flex">
              <Monitor size={14} className="text-accent" /> Real computer session
            </span>
            <ModeSelector value="computer-use" getDraft={() => goal} />
          </div>
          <button type="submit" disabled={busy || !goal.trim()} className="btn-send" aria-label="Take control">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={17} />}
          </button>
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-zinc-500">
        Blue frame + Stop button appear on your screen. Approval required for sensitive actions.
      </p>
    </div>
  );
}

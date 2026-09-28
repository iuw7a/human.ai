"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, Loader2, ArrowRight } from "lucide-react";

export function AgentStarter() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!goal.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status}).`);
      router.push(`/agent/${j.sessionId}`);
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
          placeholder="Describe the task, e.g. Open example.com and tell me the page title…"
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Bot size={14} className="text-accent" /> Isolated Chromium session
          </span>
          <button type="submit" disabled={busy || !goal.trim()} className="btn-send" aria-label="Start agent task">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={17} />}
          </button>
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-zinc-500">
        The agent asks for approval before sensitive actions.
      </p>
    </div>
  );
}

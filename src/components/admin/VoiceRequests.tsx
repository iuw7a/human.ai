"use client";

import { useEffect, useState } from "react";
import { Check, Coins, Loader2, X } from "lucide-react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Req {
  id: string;
  user_id: string;
  user: string;
  amount: number;
  status: string;
  created_at: string;
  decided_at: string | null;
}

/** Admin inbox for voice token requests: approve (grant N) or reject. */
export function VoiceRequests() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/voice-requests");
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setReqs(j.requests ?? []);
        const init: Record<string, number> = {};
        for (const r of j.requests ?? []) init[r.id] = r.amount;
        setAmounts((prev) => ({ ...init, ...prev }));
      }
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/voice-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, amount: amounts[id] ?? undefined }),
      });
      const j = await res.json().catch(() => null);
      show(res.ok ? (action === "approve" ? `Granted ${j?.granted ?? ""} tokens.` : "Rejected.") : (j?.error ?? "Failed."));
      if (res.ok) load();
    } catch {
      show("Failed.");
    } finally {
      setBusy(null);
    }
  }

  const open = reqs.filter((r) => r.status === "open");
  const done = reqs.filter((r) => r.status !== "open");

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Coins size={15} className="text-accent" /> Open requests ({open.length})
        </h2>
        {loading && <p className="py-4 text-center text-sm text-zinc-500">Loading…</p>}
        {!loading && open.length === 0 && <EmptyState text="No open requests." />}
        <div className="mt-2 space-y-2">
          {open.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/40 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{r.user}</p>
                <p className="font-mono text-[11px] text-zinc-500">
                  wants {r.amount} tokens · {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <input
                type="number"
                min={1}
                max={1000}
                value={amounts[r.id] ?? r.amount}
                onChange={(e) => setAmounts((p) => ({ ...p, [r.id]: Number(e.target.value) || 1 }))}
                className="input !w-20 !px-2 !py-1 text-xs"
                title="Tokens to grant"
              />
              <button
                onClick={() => decide(r.id, "approve")}
                disabled={busy === r.id}
                className="btn-primary !px-3 !py-1.5 text-xs"
              >
                {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Grant
              </button>
              <button
                onClick={() => decide(r.id, "reject")}
                disabled={busy === r.id}
                className="btn-ghost border border-ink-700 !px-3 !py-1.5 text-xs"
              >
                <X size={13} /> Reject
              </button>
            </div>
          ))}
        </div>
      </div>
      {done.length > 0 && (
        <div className="card space-y-1.5 p-4">
          <h2 className="text-sm font-semibold text-white">Decided</h2>
          {done.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs text-zinc-500">
              <StatusPill value={r.status} tone={r.status === "approved" ? "green" : "gray"} />
              <span className="truncate">{r.user} · {r.amount} tokens · {new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

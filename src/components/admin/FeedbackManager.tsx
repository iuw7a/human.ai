"use client";

import { useEffect, useState } from "react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Row { id: string; user_id: string; chat_id: string; model: string; rating: string; excerpt: string; status: string; created_at: string }

export function FeedbackManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("all");
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch(`/api/admin/feedback?status=${status}`);
    const j = await res.json();
    setRows(j.rows ?? []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setStatus(id: string, s: string) {
    const res = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: s }),
    });
    show(res.ok ? `→ ${s}.` : "Failed.");
    if (res.ok) load();
  }

  return (
    <div>
      {ToastEl}
      <div className="mb-3 flex gap-2">
        {(["all", "open", "reviewing", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${status === s ? "bg-ink-700 text-white" : "text-zinc-500 hover:text-zinc-200"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-3 p-4">
            <span className="text-lg">{r.rating === "up" ? "👍" : "👎"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-200">{r.excerpt || "—"}</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                {r.model || "unknown model"} · chat {r.chat_id?.slice(0, 8) || "—"} · {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            <StatusPill value={r.status} tone={r.status === "open" ? "red" : r.status === "reviewing" ? "amber" : "green"} />
            <div className="flex gap-1.5">
              {r.status !== "reviewing" && (
                <button onClick={() => setStatus(r.id, "reviewing")} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Reviewing</button>
              )}
              {r.status !== "resolved" && (
                <button onClick={() => setStatus(r.id, "resolved")} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Resolve</button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && <EmptyState text="No feedback. Users vote with thumbs on AI answers." />}
      </div>
    </div>
  );
}

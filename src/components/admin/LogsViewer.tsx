"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/admin/ui";

interface Row { id: string; admin_id: string; admin_email: string; action: string; target: string | null; metadata: Record<string, unknown>; created_at: string }

export function LogsViewer({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const s = q.toLowerCase();
  const filtered = rows.filter(
    (r) => !s || r.action.toLowerCase().includes(s) || (r.target ?? "").toLowerCase().includes(s) || r.admin_email.toLowerCase().includes(s)
  );
  return (
    <div>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by admin, action, target…" className="input !pl-8" />
      </div>
      <div className="card p-2">
        {filtered.length === 0 && <EmptyState text="No audit entries." />}
        {filtered.slice(0, 300).map((r) => (
          <p key={r.id} className="border-b border-ink-800/50 px-3 py-2 font-mono text-xs last:border-0">
            <span className="text-accent">{r.admin_email}</span>{" "}
            <span className="text-zinc-200">{r.action}</span>{" "}
            {r.target && <span className="text-zinc-400">→ {r.target}</span>}{" "}
            <span className="text-zinc-600">{new Date(r.created_at).toLocaleString()}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

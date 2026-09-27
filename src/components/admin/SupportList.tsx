"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusPill, EmptyState } from "@/components/admin/ui";

interface Row { id: string; user_id: string; owner: string; subject: string; status: string; created_at: string; updated_at: string }

export function SupportList({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState("all");
  const list = rows.filter((r) => filter === "all" || r.status === filter);
  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {(["all", "open", "pending", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === s ? "bg-ink-700 text-white" : "text-zinc-500 hover:text-zinc-200"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-ink-800/60">
        {list.map((t) => (
          <Link key={t.id} href={`/admin/support/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-850/50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{t.subject}</p>
              <p className="text-xs text-zinc-500">{t.owner} · {new Date(t.created_at).toLocaleString()}</p>
            </div>
            <StatusPill value={t.status} tone={t.status === "open" ? "red" : t.status === "pending" ? "amber" : "green"} />
          </Link>
        ))}
        {list.length === 0 && <EmptyState text="No tickets." />}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Row { id: string; name: string; email: string; plan: string; status: string }
interface Evt { id: string; user_id: string; from_plan: string; to_plan: string; created_at: string }

export function SubscriptionsManager({ rows, events }: { rows: Row[]; events: Evt[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const { show, ToastEl } = useToast();

  const filtered = rows.filter((r) => {
    if (plan !== "all" && r.plan !== plan) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.id.includes(s);
  });

  async function changePlan(id: string, p: string) {
    const res = await fetch("/api/admin/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, plan: p }),
    });
    show(res.ok ? `Plan → ${p}.` : "Failed.");
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {ToastEl}
      <div className="mb-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, ID…" className="input" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input !w-auto">
          <option value="all">All plans</option>
          <option value="plus">Plus</option>
          <option value="free">Free</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-b border-ink-800/60 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-white">{r.name || "—"}</p>
                  <p className="text-xs text-zinc-500">{r.email}</p>
                </td>
                <td className="px-4 py-2.5"><StatusPill value={r.plan} tone={r.plan === "plus" ? "amber" : "gray"} /></td>
                <td className="px-4 py-2.5"><StatusPill value={r.status} tone={r.status === "active" ? "green" : "red"} /></td>
                <td className="px-4 py-2.5 text-right">
                  {r.plan === "plus" ? (
                    <button onClick={() => changePlan(r.id, "free")} className="btn-ghost !px-2.5 !py-1 text-xs">Remove Plus</button>
                  ) : (
                    <button onClick={() => changePlan(r.id, "plus")} className="btn-ghost !px-2.5 !py-1 text-xs">Give Plus</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState text="No subscriptions match." />}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">History</h2>
      <div className="card p-4">
        {events.length === 0 && <p className="text-xs text-zinc-500">No changes recorded yet.</p>}
        {events.slice(0, 50).map((e) => (
          <p key={e.id} className="py-1 text-[13px] text-zinc-300">
            <span className="font-mono text-zinc-500">{e.user_id.slice(0, 8)}…</span> {e.from_plan} → <b>{e.to_plan}</b>
            <span className="text-zinc-600"> · {new Date(e.created_at).toLocaleString()}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

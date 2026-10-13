"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";
import { SubscriptionBadge, SourceBadge, planTone, statusTone } from "@/components/SubscriptionBadge";

interface Row {
  id: string; name: string; email: string; avatar_url: string | null;
  plan: string; status: string; subscription_status: string;
  subscription_source: string | null; subscription_starts_at: string | null;
  subscription_expires_at: string | null; subscription_provider_ref: string | null;
  subscription_granted_by: string | null; created_at: string;
}
interface Evt {
  id: string; user_id: string; from_plan: string; to_plan: string;
  source: string | null; status: string | null; starts_at: string | null;
  expires_at: string | null; provider_ref: string | null;
  changed_by: string | null; changed_by_email: string | null; created_at: string;
}

function fmt(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "—";
  }
}

export function SubscriptionsManager({ rows, events }: { rows: Row[]; events: Evt[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grantPlan, setGrantPlan] = useState("plus");
  const [duration, setDuration] = useState("30");
  const [customExpiry, setCustomExpiry] = useState("");
  const { show, ToastEl } = useToast();

  const filtered = rows.filter((r) => {
    if (plan !== "all" && r.plan !== plan) return false;
    if (status !== "all" && r.subscription_status !== status) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.id.includes(s);
  });

  async function call(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Saved." : (j?.error ?? "Failed."));
    if (res.ok) {
      setGrantFor(null);
      router.refresh();
    }
  }

  async function assign(id: string) {
    const days = duration === "custom" ? undefined : Number(duration);
    await call("/api/admin/subscriptions", {
      user_id: id,
      plan: grantPlan,
      source: "admin_grant",
      duration_days: days,
      expires_at: duration === "custom" ? customExpiry : undefined,
    });
  }

  return (
    <div>
      {ToastEl}
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, ID…" className="input min-w-0 flex-1" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="input !w-auto">
          <option value="all">All plans</option>
          <option value="pro">Pro</option>
          <option value="plus">Plus</option>
          <option value="free">Free</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input !w-auto">
          <option value="all">All statuses</option>
          <option value="free">Free</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Start / Expiry</th>
              <th className="px-4 py-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 150).map((r) => (
              <tr key={r.id} className="border-b border-ink-800/60 last:border-0">
                <td className="px-4 py-2.5">
                  <SubscriptionBadge name={r.name} plan={r.plan} />
                  <p className="text-xs text-zinc-500">{r.email}</p>
                  <p className="font-mono text-[11px] text-zinc-600">{r.id.slice(0, 8)}… · {new Date(r.created_at).toLocaleDateString()}</p>
                </td>
                <td className="px-4 py-2.5"><StatusPill value={r.plan} tone={planTone(r.plan)} /></td>
                <td className="px-4 py-2.5"><StatusPill value={r.subscription_status} tone={statusTone(r.subscription_status)} /></td>
                <td className="px-4 py-2.5"><SourceBadge source={r.subscription_source} /></td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {fmt(r.subscription_starts_at)} → {fmt(r.subscription_expires_at)}
                  {r.subscription_provider_ref && <p className="font-mono text-[11px] text-zinc-600">ref: {r.subscription_provider_ref}</p>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {grantFor === r.id ? (
                      <span className="flex flex-wrap items-center justify-end gap-1.5">
                        <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs">
                          <option value="plus">Plus</option>
                          <option value="pro">Pro</option>
                          <option value="free">Free</option>
                        </select>
                        <select value={duration} onChange={(e) => setDuration(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs">
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                          <option value="365">1 year</option>
                          <option value="custom">Custom…</option>
                        </select>
                        {duration === "custom" && (
                          <input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs" />
                        )}
                        <button onClick={() => void assign(r.id)} className="btn-primary !px-2.5 !py-1 text-xs">Grant</button>
                        <button onClick={() => setGrantFor(null)} className="btn-ghost !px-2.5 !py-1 text-xs">Cancel</button>
                      </span>
                    ) : (
                      <>
                        <button onClick={() => { setGrantFor(r.id); setGrantPlan(r.plan === "free" ? "plus" : r.plan); }} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Grant</button>
                        {r.subscription_status === "suspended" ? (
                          <button onClick={() => void call("/api/admin/subscriptions", { user_id: r.id, action: "restore" })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Restore</button>
                        ) : r.plan !== "free" ? (
                          <button onClick={() => void call("/api/admin/subscriptions", { user_id: r.id, action: "suspend" })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Suspend</button>
                        ) : null}
                        {r.subscription_source === "admin_grant" && r.plan !== "free" && (
                          <button onClick={() => { if (confirm("Revoke this admin grant?")) void call("/api/admin/subscriptions", { user_id: r.id, action: "revoke" }); }} className="btn-ghost !px-2.5 !py-1 text-xs border border-accent/40 hover:!text-accent">Revoke</button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState text="No subscriptions match." />}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">History — who granted/changed, when, from which source</h2>
      <div className="card p-4">
        {events.length === 0 && <p className="text-xs text-zinc-500">No changes recorded yet.</p>}
        {events.slice(0, 80).map((e) => (
          <p key={e.id} className="border-b border-ink-800/40 py-1.5 text-[13px] text-zinc-300 last:border-0">
            <span className="font-mono text-zinc-500">{e.user_id.slice(0, 8)}…</span> {e.from_plan} → <b>{e.to_plan}</b>
            {e.source && <span className="ml-1.5 rounded-full bg-ink-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{e.source}</span>}
            {e.status && <span className="ml-1 text-[11px] text-zinc-500">({e.status})</span>}
            {e.changed_by_email && <span className="ml-1.5 text-zinc-400">by {e.changed_by_email}</span>}
            <span className="text-zinc-600"> · {new Date(e.created_at).toLocaleString()}</span>
            {e.expires_at && <span className="block text-[11px] text-zinc-600">expires {new Date(e.expires_at).toLocaleString()}</span>}
          </p>
        ))}
      </div>
    </div>
  );
}

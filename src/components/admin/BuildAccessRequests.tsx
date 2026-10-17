"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, Loader2, RefreshCw, X } from "lucide-react";
import { EmptyState, StatusPill, useToast } from "@/components/admin/ui";

interface AccessRequest {
  id: string;
  user_id: string;
  email: string;
  name: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  duration_days: number | null;
  approved_until: string | null;
  created_at: string;
}

export function BuildAccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [days, setDays] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/build-access");
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not load requests.");
      const rows = (data.requests ?? []) as AccessRequest[];
      setRequests(rows);
      setDays((previous) => {
        const next = { ...previous };
        for (const row of rows) next[row.id] ??= 7;
        return next;
      });
    } catch (error) {
      show(error instanceof Error ? error.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(request: AccessRequest, action: "approve" | "reject") {
    setBusy(request.id);
    try {
      const response = await fetch("/api/admin/build-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, action, durationDays: days[request.id] ?? 7 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not update request.");
      show(action === "approve" ? `Access granted for ${days[request.id] ?? 7} days.` : "Request declined.");
      await load();
    } catch (error) {
      show(error instanceof Error ? error.message : "Could not update request.");
    } finally {
      setBusy(null);
    }
  }

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  return (
    <div className="space-y-5">
      {ToastEl}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Pending requests ({pending.length})</h2>
          <button className="btn-ghost p-2" onClick={() => void load()} title="Refresh requests" aria-label="Refresh requests">
            <RefreshCw size={15} />
          </button>
        </div>
        {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading requests…</p>}
        {!loading && pending.length === 0 && <EmptyState text="No pending Build access requests." />}
        <div className="mt-3 space-y-3">
          {pending.map((request) => (
            <article key={request.id} className="border border-white/[0.08] bg-black/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{request.name}</h3>
                  <p className="mt-1 break-all text-xs text-zinc-500">{request.email}</p>
                </div>
                <time className="text-[11px] text-zinc-600">{new Date(request.created_at).toLocaleString()}</time>
              </div>
              <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-accent/50 pl-3 text-sm leading-6 text-zinc-300">
                {request.message}
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-zinc-500">
                  Access duration (days)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days[request.id] ?? 7}
                    onChange={(event) => setDays((previous) => ({ ...previous, [request.id]: Number(event.target.value) || 1 }))}
                    className="input mt-1 !w-28 !px-2 !py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={() => void decide(request, "approve")}
                  disabled={busy === request.id}
                  className="btn-primary !rounded-md !px-3 !py-2 text-xs"
                >
                  {busy === request.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Approve
                </button>
                <button
                  onClick={() => void decide(request, "reject")}
                  disabled={busy === request.id}
                  className="btn-ghost !rounded-md border border-white/10 !px-3 !py-2 text-xs"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {reviewed.length > 0 && (
        <section className="card p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Recently reviewed</h2>
          <div className="space-y-2">
            {reviewed.slice(0, 30).map((request) => (
              <div key={request.id} className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] py-2 text-xs">
                <StatusPill value={request.status} tone={request.status === "approved" ? "green" : "gray"} />
                <span className="min-w-0 flex-1 truncate text-zinc-300">{request.name} · {request.email}</span>
                {request.status === "approved" && request.approved_until && (
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <Clock3 size={12} /> Until {new Date(request.approved_until).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
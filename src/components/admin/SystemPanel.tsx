"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader, StatusPill, EmptyState } from "@/components/admin/ui";

interface Check { name: string; status: "healthy" | "warning" | "error"; detail: string }

export function SystemPanel() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system");
      const j = await res.json();
      setChecks(j.checks ?? []);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="System"
        sub="Live service health. No secrets are exposed here."
        action={
          <button onClick={load} className="btn-ghost border border-ink-700 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />
      {loading && <p className="py-8 text-center text-sm text-zinc-500">Checking services…</p>}
      {!loading && (!checks || checks.length === 0) && <EmptyState text="No data." />}
      <div className="grid gap-3 sm:grid-cols-2">
        {(checks ?? []).map((c) => (
          <div key={c.name} className="card flex items-start justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="mt-1 font-mono text-xs text-zinc-400">{c.detail}</p>
            </div>
            <StatusPill value={c.status} tone={c.status === "healthy" ? "green" : c.status === "warning" ? "amber" : "red"} />
          </div>
        ))}
      </div>
    </div>
  );
}

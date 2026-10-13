"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader, StatusPill, EmptyState } from "@/components/admin/ui";

interface Provider {
  key: string; label: string; configured: boolean; baseUrl: string;
  reachable: boolean | null; detail: string; modelCount: number;
}
interface RModel {
  id: string; provider: string; providerModelId: string; vision: boolean;
  streaming: boolean; enabled: boolean; plan: string; access_level: string;
  allowedPlans: string[]; is_default: boolean;
}

export function ProvidersPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<RModel[]>([]);
  const [entitlements, setEntitlements] = useState<Record<string, string[]> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/providers");
      const j = await res.json();
      setProviders(j.providers ?? []);
      setModels(j.models ?? []);
      setEntitlements(j.entitlements ?? null);
    } catch {
      setProviders([]);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveRule(plan: string, levels: string[]) {
    const res = await fetch("/api/admin/plan-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, access_levels: levels }),
    });
    if (res.ok) load();
    else {
      const j = await res.json().catch(() => null);
      alert(j?.error ?? "Failed.");
    }
  }

  const levels: string[] = ["light", "pro", "high", "extra"];

  return (
    <div>
      <PageHeader
        title="Providers"
        sub="Live integrations, capabilities and tier access. Keys are never displayed."
        action={
          <button onClick={load} className="btn-ghost border border-ink-700 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />
      {loading && <p className="py-8 text-center text-sm text-zinc-500">Checking providers…</p>}
      {!loading && providers.length === 0 && <EmptyState text="No data." />}
      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((p) => (
          <div key={p.key} className="card p-4">
            <p className="flex items-center justify-between text-sm font-medium text-white">
              {p.label}
              <StatusPill
                value={p.configured ? (p.reachable ? "reachable" : p.reachable === false ? "unreachable" : "key set") : "no key"}
                tone={p.reachable ? "green" : p.configured ? "amber" : "red"}
              />
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">{p.baseUrl}</p>
            <p className="mt-1 text-xs text-zinc-400">{p.detail} · {p.modelCount} model(s)</p>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Models — capabilities and tier access</h2>
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-white">{m.id} {m.is_default && <StatusPill value="default" tone="blue" />}</p>
              <p className="truncate font-mono text-xs text-zinc-500">{m.provider} · {m.providerModelId}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusPill value={m.enabled ? "enabled" : "disabled"} tone={m.enabled ? "green" : "gray"} />
                <StatusPill value={m.access_level} tone={m.access_level === "light" ? "gray" : m.access_level === "pro" ? "amber" : "blue"} />
                {m.vision && <StatusPill value="vision" tone="blue" />}
                {m.streaming && <StatusPill value="streaming" tone="gray" />}
                <StatusPill value={`min: ${m.plan}`} tone="gray" />
              </div>
            </div>
            <div className="text-right text-xs text-zinc-400">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">Allowed for</p>
              <p>{(m.allowedPlans ?? []).join(", ") || "—"}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Plan → capability rules (admin-configurable)</h2>
      <div className="card space-y-3 p-4">
        {!entitlements && <p className="text-xs text-zinc-500">Loading rules…</p>}
        {entitlements &&
          Object.entries(entitlements).map(([plan, lv]) => (
            <div key={plan} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-sm font-medium capitalize text-white">{plan}</span>
              <span className="flex flex-wrap gap-1.5">
                {levels.map((l) => {
                  const on = lv.includes(l);
                  return (
                    <button
                      key={l}
                      onClick={() => {
                        const next = on ? lv.filter((x) => x !== l) : [...lv, l];
                        void saveRule(plan, next);
                      }}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
                        on
                          ? "bg-accent/15 text-white ring-accent/40"
                          : "bg-ink-850 text-zinc-500 ring-ink-700 hover:text-zinc-200"
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        <p className="text-[11px] text-zinc-600">
          Changes apply to /api/chat immediately. Free must always keep Light. High/Extra stay restricted to the tiers you allow here.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";

interface M {
  id: string; provider: string; name: string; providerModelId: string;
  vision: boolean; enabled: boolean; plan: string; sort: number; is_default: boolean;
}

export function ModelsManager() {
  const [models, setModels] = useState<M[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ slug: "", name: "", provider_model_id: "", vision: true, plan: "free" });
  const { show, ToastEl } = useToast();

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/models");
    const j = await res.json();
    setModels(j.models ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function call(method: string, body?: unknown, qs?: string) {
    const res = await fetch(`/api/admin/models${qs ?? ""}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Saved." : (j?.error ?? "Failed."));
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Add model</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug (e.g. my-model)" className="input" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Display name (shown as Human AI)" className="input" />
          <input value={form.provider_model_id} onChange={(e) => setForm({ ...form, provider_model_id: e.target.value })} placeholder="Provider model id (e.g. vendor/model-x)" className="input sm:col-span-2" />
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="input">
            <option value="free">Free</option>
            <option value="plus">Plus only</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.checked })} />
            Vision (images)
          </label>
        </div>
        <button onClick={() => call("POST", form)} className="btn-primary text-xs">Add model</button>
        <p className="text-[11px] text-zinc-600">Provider API keys stay server-side and are never shown here.</p>
      </div>

      {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>}
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-white">{m.id} {m.is_default && <StatusPill value="default" tone="blue" />}</p>
              <p className="truncate font-mono text-xs text-zinc-500">{m.providerModelId}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusPill value={m.enabled ? "enabled" : "disabled"} tone={m.enabled ? "green" : "gray"} />
                <StatusPill value={m.plan} tone={m.plan === "plus" ? "amber" : "gray"} />
                {m.vision && <StatusPill value="vision" tone="blue" />}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => call("PUT", { slug: m.id, enabled: !m.enabled })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">
                {m.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => call("PUT", { slug: m.id, plan: m.plan === "plus" ? "free" : "plus" })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">
                {m.plan === "plus" ? "→ Free" : "→ Plus"}
              </button>
              {!m.is_default && (
                <button onClick={() => call("PUT", { slug: m.id, is_default: true })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">
                  Default
                </button>
              )}
              <input
                defaultValue={m.name}
                onBlur={(e) => { if (e.target.value !== m.name) call("PUT", { slug: m.id, name: e.target.value }); }}
                className="input !w-32 !px-2 !py-1 text-xs"
                title="Display name (Enter to save on blur)"
              />
              <ConfirmButton onConfirm={() => call("DELETE", undefined, `?slug=${m.id}`)} confirmText="Delete?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                <span className="text-xs">Delete</span>
              </ConfirmButton>
            </div>
          </div>
        ))}
        {!loading && models.length === 0 && <EmptyState text="No models." />}
      </div>
    </div>
  );
}

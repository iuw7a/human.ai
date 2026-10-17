"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";

interface M {
  id: string; provider: string; name: string; providerModelId: string;
  vision: boolean; enabled: boolean; plan: string; access_level: string;
  sort: number; is_default: boolean;
}

interface Provider {
  key: string; label: string; configured: boolean; baseUrl: string;
  reachable: boolean | null; detail: string; modelCount: number;
}

export function ModelsManager() {
  const [models, setModels] = useState<M[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [entitlements, setEntitlements] = useState<Record<string, string[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ slug: "", name: "", provider: "nvidia", provider_model_id: "", vision: true, plan: "free", access_level: "light" });
  const { show, ToastEl } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [mr, pr] = await Promise.all([
        fetch("/api/admin/models").then((r) => r.json()),
        fetch("/api/admin/providers").then((r) => r.json()).catch(() => null),
      ]);
      setModels(mr.models ?? []);
      if (pr) {
        setProviders(pr.providers ?? []);
        setEntitlements(pr.entitlements ?? null);
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
        <h2 className="text-sm font-semibold text-white">Providers — connection status (keys never shown)</h2>
        {providers.length === 0 && <p className="text-xs text-zinc-500">Loading provider status…</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <div key={p.key} className="rounded-xl border border-ink-700 bg-ink-850 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                {p.label}
                <StatusPill value={p.configured ? (p.reachable ? "reachable" : p.reachable === false ? "unreachable" : "key set") : "no key"} tone={p.reachable ? "green" : p.configured ? "amber" : "red"} />
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">{p.baseUrl}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{p.detail} · {p.modelCount} model(s)</p>
            </div>
          ))}
        </div>
        {entitlements && (
          <p className="text-[11px] text-zinc-500">
            Entitlements — Free: {(entitlements.free ?? []).join(", ")} · Plus: {(entitlements.plus ?? []).join(", ")} · Pro: {(entitlements.pro ?? []).join(", ")}
            {" "}(admin-configurable via /api/admin/plan-rules)
          </p>
        )}
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Add model (real provider IDs only)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug (e.g. my-model)" className="input" />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Display name (shown as Human AI)" className="input" />
          <input value={form.provider_model_id} onChange={(e) => setForm({ ...form, provider_model_id: e.target.value })} placeholder="Provider model id (e.g. vendor/model-x)" className="input sm:col-span-2" />
          <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="input" title="Provider">
            <option value="nvidia">NVIDIA</option>
            <option value="groq">Groq</option>
            <option value="ifm">IFM</option>
            <option value="agnes">Agnes (image)</option>
            <option value="kira">Kira AI (gateway)</option>
            <option value="codecraft">CodeCraft (gateway)</option>
            <option value="bynara">NaraRouter (gateway)</option>
            <option value="openrouter">OpenRouter (gateway)</option>
            <option value="ollama">Ollama Cloud (gateway)</option>
            <option value="xkiro">Xkiro (gateway)</option>
          </select>
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value, access_level: e.target.value === "free" ? "light" : e.target.value === "plus" ? "pro" : "high" })} className="input" title="Minimum plan">
            <option value="free">Free (min plan)</option>
            <option value="plus">Plus (min plan)</option>
            <option value="pro">Pro (min plan)</option>
          </select>
          <select value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })} className="input" title="AI capability tier">
            <option value="light">Light</option>
            <option value="pro">Pro</option>
            <option value="high">High</option>
            <option value="extra">Extra</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.checked })} />
            Vision (images)
          </label>
        </div>
        <button onClick={() => call("POST", form)} className="btn-primary text-xs">Add model</button>
        <p className="text-[11px] text-zinc-600">Provider API keys stay server-side and are never shown here. Which tiers can access a model = min plan + capability tier.</p>
      </div>

      {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>}
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-white">{m.id} {m.is_default && <StatusPill value="default" tone="blue" />}</p>
              <p className="truncate font-mono text-xs text-zinc-500">{m.provider} · {m.providerModelId}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusPill value={m.enabled ? "enabled" : "disabled"} tone={m.enabled ? "green" : "gray"} />
                <StatusPill value={`min: ${m.plan}`} tone={m.plan === "free" ? "gray" : m.plan === "plus" ? "amber" : "blue"} />
                <StatusPill value={m.access_level} tone={m.access_level === "light" ? "gray" : m.access_level === "pro" ? "amber" : "blue"} />
                {m.vision && <StatusPill value="vision" tone="blue" />}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={() => call("PUT", { slug: m.id, enabled: !m.enabled })} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">
                {m.enabled ? "Disable" : "Enable"}
              </button>
              <select value={m.plan} onChange={(e) => call("PUT", { slug: m.id, plan: e.target.value })} className="input !w-auto !px-2 !py-1 text-xs" title="Minimum plan">
                <option value="free">Free</option>
                <option value="plus">Plus</option>
                <option value="pro">Pro</option>
              </select>
              <select value={m.access_level ?? "light"} onChange={(e) => call("PUT", { slug: m.id, access_level: e.target.value })} className="input !w-auto !px-2 !py-1 text-xs" title="Capability tier">
                <option value="light">Light</option>
                <option value="pro">Pro</option>
                <option value="high">High</option>
                <option value="extra">Extra</option>
              </select>
              <button
                onClick={() => call("PUT", { slug: m.id, provider: m.provider === "groq" ? "ifm" : m.provider === "ifm" ? "nvidia" : "groq" })}
                className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700"
                title="Switch provider"
              >
                → {m.provider === "groq" ? "IFM" : m.provider === "ifm" ? "NVIDIA" : "Groq"}
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

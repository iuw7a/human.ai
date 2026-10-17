"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusPill, useToast } from "@/components/admin/ui";

interface Gateway {
  key: string; label: string; base_url: string; enabled: boolean;
  monthly_limit_tokens: number; masked: string; has_key: boolean;
  reachable: boolean | null; detail: string; modelCount: number | null;
  topup_url: string | null; needs_topup: boolean;
  last_billing_error: string | null; last_billing_at: string | null; billing_fails: number;
}

interface FailedModel {
  gateway_key: string; model_slug: string; error: string; created_at: string;
}

interface DbModel {
  id: string; provider: string; name: string; providerModelId: string;
  vision: boolean; enabled: boolean; plan: string; access_level: string;
  sort: number; is_default: boolean;
}

interface Grant {
  id: string; user_id: string; model_slug: string; email?: string; created_at: string;
}

interface SearchedUser {
  id: string; email: string; name: string;
}

export function ApiLabManager() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [models, setModels] = useState<DbModel[]>([]);
  const [defaults, setDefaults] = useState<{ chat: string; image: string; code: string }>({ chat: "", image: "", code: "" });
  const [grants, setGrants] = useState<Grant[]>([]);
  const [failedModels, setFailedModels] = useState<FailedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [gwForm, setGwForm] = useState({ key: "kira", api_key: "", monthly_limit_tokens: "" });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SearchedUser[]>([]);
  const [pickedUser, setPickedUser] = useState<SearchedUser | null>(null);
  const [grantModel, setGrantModel] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [providerTab, setProviderTab] = useState("all");
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: string; content: string }[]>([]);
  const [chatting, setChatting] = useState(false);
  const { show, ToastEl } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [g, m, d, gr] = await Promise.all([
        fetch("/api/admin/gateways").then((r) => r.json()).catch(() => null),
        fetch("/api/admin/models").then((r) => r.json()).catch(() => null),
        fetch("/api/admin/chat-defaults").then((r) => r.json()).catch(() => null),
        fetch("/api/admin/grants").then((r) => r.json()).catch(() => null),
      ]);
      if (g?.gateways) setGateways(g.gateways);
      if (g?.failed_models) setFailedModels(g.failed_models);
      if (m?.models) {
        setModels(m.models);
        if (!chatModel && m.models.length > 0) setChatModel(m.models[0].id);
        if (!grantModel && m.models.length > 0) setGrantModel(m.models[0].id);
      }
      if (d?.defaults) setDefaults(d.defaults);
      if (gr?.grants) setGrants(gr.grants);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (q.trim().length < 1) {
      setFound([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`).then((res) => res.json());
        setFound(r.users ?? []);
      } catch {
        setFound([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function saveGatewayKey() {
    const res = await fetch("/api/admin/gateways", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: gwForm.key,
        api_key: gwForm.api_key || undefined,
        monthly_limit_tokens: gwForm.monthly_limit_tokens ? Number(gwForm.monthly_limit_tokens) : undefined,
      }),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Gateway saved." : (j?.error ?? "Failed."));
    setGwForm({ ...gwForm, api_key: "" });
    if (res.ok) load();
  }

  async function setDefault(purpose: "chat" | "image" | "code", model: string) {
    const res = await fetch("/api/admin/chat-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, model_slug: model }),
    });
    show(res.ok ? `${purpose} default → ${model}` : "Failed.");
    if (res.ok) load();
  }

  async function toggleModel(m: DbModel) {
    const res = await fetch("/api/admin/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: m.id, enabled: !m.enabled }),
    });
    if (res.ok) load();
  }

  async function grant() {
    if (!pickedUser || !grantModel) {
      show("Pick a user and a model.");
      return;
    }
    const res = await fetch("/api/admin/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: pickedUser.id, model_slug: grantModel }),
    });
    show(res.ok ? `Granted ${grantModel} → ${pickedUser.email}` : "Failed.");
    if (res.ok) {
      setPickedUser(null);
      setQ("");
      load();
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/grants?id=${id}`, { method: "DELETE" });
    load();
  }

  async function sendChat() {
    if (!chatInput.trim() || !chatModel || chatting) return;
    const next = [...chatLog, { role: "user", content: chatInput.slice(0, 4000) }];
    setChatLog(next);
    setChatInput("");
    setChatting(true);
    try {
      const res = await fetch("/api/admin/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: chatModel, messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setChatLog([...next, { role: "assistant", content: `Error: ${j?.error ?? res.status}` }]);
        return;
      }
      let acc = "";
      setChatLog([...next, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data) as { token?: string; error?: string };
            if (j.error) acc += `\nError: ${j.error}`;
            else if (j.token) acc += j.token;
            setChatLog([...next, { role: "assistant", content: acc }]);
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setChatting(false);
    }
  }

  const failedSet = useMemo(() => new Set(failedModels.map((f) => f.model_slug)), [failedModels]);

  const grouped = useMemo(() => {
    const g = new Map<string, DbModel[]>();
    for (const m of models) {
      const k = m.provider;
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(m);
    }
    return [...g.entries()];
  }, [models]);

  return (
    <div className="space-y-4">
      {ToastEl}

      {/* Gateways */}
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-white">Gateways — keys stay server-side</h2>
        <div className="grid gap-2 md:grid-cols-3">
          {gateways.map((gw) => (
            <div key={gw.key} className={`rounded-xl border p-3 ${gw.needs_topup ? "border-red-500/40 bg-red-500/[0.04]" : "border-ink-700 bg-ink-850"}`}>
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                {gw.label}
                <StatusPill value={gw.has_key ? (gw.reachable ? "reachable" : gw.reachable === false ? "unreachable" : "key set") : "no key"} tone={gw.reachable ? "green" : gw.has_key ? "amber" : "red"} />
                {gw.needs_topup && <StatusPill value="needs top-up" tone="red" />}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">{gw.base_url}</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{gw.masked} · {gw.modelCount ?? "—"} models · limit {gw.monthly_limit_tokens || "∞"}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{gw.detail}</p>
              {gw.needs_topup && (
                <div className="mt-1.5 rounded-lg bg-red-500/10 p-2">
                  <p className="text-[11px] text-red-300">{gw.billing_fails} billing fail(s){gw.last_billing_at ? ` · last ${new Date(gw.last_billing_at).toLocaleString()}` : ""}</p>
                  {gw.last_billing_error && <p className="mt-0.5 break-words font-mono text-[10px] text-red-200/70">{gw.last_billing_error.slice(0, 220)}</p>}
                  {gw.topup_url && <a href={gw.topup_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-medium text-sky-300 underline">Top up →</a>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={gwForm.key} onChange={(e) => setGwForm({ ...gwForm, key: e.target.value })} className="input !w-auto">
            {gateways.map((g) => (
              <option key={g.key} value={g.key}>{g.key}</option>
            ))}
          </select>
          <input value={gwForm.api_key} onChange={(e) => setGwForm({ ...gwForm, api_key: e.target.value })} placeholder="Paste new API key (blank = keep)" className="input min-w-64 flex-1" type="password" />
          <input value={gwForm.monthly_limit_tokens} onChange={(e) => setGwForm({ ...gwForm, monthly_limit_tokens: e.target.value })} placeholder="Monthly token limit (0 = ∞)" className="input !w-44" inputMode="numeric" />
          <button onClick={saveGatewayKey} className="btn-primary text-xs">Save gateway</button>
        </div>
      </div>

      {/* Global defaults */}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Global chat defaults — applies to all users</h2>
        <div className="grid gap-2 md:grid-cols-3">
          {(["chat", "image", "code"] as const).map((purpose) => (
            <label key={purpose} className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">{purpose}</span>
              <select
                value={(defaults as Record<string, string>)[purpose] ?? ""}
                onChange={(e) => setDefault(purpose, e.target.value)}
                className="input"
              >
                <option value="">—</option>
                {models.filter((m) => m.enabled).map((m) => (
                  <option key={m.id} value={m.id}>{m.id} ({m.provider})</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-zinc-600">Changing these changes the default model in /api/models for every user immediately.</p>
      </div>

      {/* Models as cards */}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Models ({models.length}) — cards</h2>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...grouped.map(([p]) => p)]).map((p) => (
            <button
              key={p}
              onClick={() => setProviderTab(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                providerTab === p
                  ? "bg-accent/15 text-white ring-accent/40"
                  : "bg-ink-850 text-zinc-500 ring-ink-700 hover:text-zinc-200"
              }`}
            >
              {p === "all" ? `All (${models.length})` : p}
            </button>
          ))}
        </div>
        {loading && <p className="text-xs text-zinc-500">Loading…</p>}
        {grouped
          .filter(([provider]) => providerTab === "all" || provider === providerTab)
          .map(([provider, list]) => (
          <div key={provider}>
            <p className="mb-1.5 mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">{provider} · {list.length}</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((m) => (
                <div key={m.id} className="rounded-xl border border-ink-700 bg-ink-850 p-3">
                  <p className="font-mono text-[13px] text-white">{m.id}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">{m.providerModelId}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <StatusPill value={m.enabled ? "enabled" : "disabled"} tone={m.enabled ? "green" : "gray"} />
                    <StatusPill value={m.plan} tone="gray" />
                    <StatusPill value={m.access_level} tone="amber" />
                    {failedSet.has(m.id) && <StatusPill value="needs card" tone="red" />}
                    {m.provider === "kira" && !m.providerModelId.startsWith("kira-") && (
                      <StatusPill value="needs wallet" tone="red" />
                    )}
                    {defaults.chat === m.id && <StatusPill value="chat default" tone="blue" />}
                    {defaults.image === m.id && <StatusPill value="image default" tone="blue" />}
                    {defaults.code === m.id && <StatusPill value="code default" tone="blue" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button onClick={() => toggleModel(m)} className="btn-ghost border border-ink-700 !px-2 !py-1 text-[11px]">{m.enabled ? "Disable" : "Enable"}</button>
                    <button onClick={() => setDefault("chat", m.id)} className="btn-ghost border border-ink-700 !px-2 !py-1 text-[11px]">Chat</button>
                    <button onClick={() => setDefault("image", m.id)} className="btn-ghost border border-ink-700 !px-2 !py-1 text-[11px]">Image</button>
                    <button onClick={() => setDefault("code", m.id)} className="btn-ghost border border-ink-700 !px-2 !py-1 text-[11px]">Code</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Grants */}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Add a new grant — per-user model access (shows “via admin”)</h2>
        <div className="relative">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPickedUser(null); }} placeholder="Type a name or email — e.g. a…" className="input" />
          {found.length > 0 && !pickedUser && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
              {found.map((u) => (
                <button key={u.id} onClick={() => { setPickedUser(u); setQ(u.email); setFound([]); }} className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5">
                  {u.name} <span className="text-xs text-zinc-500">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={grantModel} onChange={(e) => setGrantModel(e.target.value)} className="input flex-1">
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
          <button onClick={grant} className="btn-primary text-xs">Grant access</button>
        </div>
        {pickedUser && <p className="text-xs text-zinc-400">Selected: {pickedUser.email}</p>}
        <div className="space-y-1.5 pt-2">
          {grants.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-xs">
              <span className="font-mono text-zinc-100">{g.model_slug}</span>
              <span className="text-zinc-500">→ {g.email ?? g.user_id.slice(0, 8)}</span>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[10px] text-sky-300">via admin</span>
              <button onClick={() => revoke(g.id)} className="ml-auto text-zinc-500 hover:text-white">Revoke</button>
            </div>
          ))}
          {grants.length === 0 && <p className="text-xs text-zinc-600">No grants yet.</p>}
        </div>
      </div>

      {/* Admin chat */}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">Admin chat — try every model</h2>
        <div className="flex gap-2">
          <select value={chatModel} onChange={(e) => setChatModel(e.target.value)} className="input flex-1">
            {models.filter((m) => m.enabled).map((m) => (
              <option key={m.id} value={m.id}>{m.id} ({m.provider})</option>
            ))}
          </select>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-ink-700 bg-black/40 p-3">
          {chatLog.length === 0 && <p className="text-xs text-zinc-600">No messages yet.</p>}
          {chatLog.map((m, i) => (
            <div key={i} className={`text-sm ${m.role === "user" ? "text-zinc-100" : "text-emerald-200"}`}>
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">{m.role}: </span>
              <span className="whitespace-pre-wrap">{m.content}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void sendChat(); }} placeholder="Message as admin…" className="input flex-1" />
          <button onClick={sendChat} disabled={chatting} className="btn-primary text-xs">{chatting ? "…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

/** Personal API key manager: create (raw shown once), copy, revoke. */
export function ApiKeysClient() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [raw, setRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/keys");
    const j = await res.json().catch(() => null);
    if (res.ok) setKeys(j.keys ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      setRaw(j.raw);
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Apps using it stop working immediately.")) return;
    await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    if (raw) setRaw(null);
    await load();
  }

  async function copy() {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}

      {raw && (
        <div className="rounded-[22px] border border-emerald-500/40 bg-emerald-500/[0.07] p-5">
          <p className="text-sm font-semibold text-white">Copy your key now — it won't be shown again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-[13px] text-emerald-200">
              {raw}
            </code>
            <button
              onClick={copy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              aria-label="Copy key"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound size={15} className="text-accent" /> New API key
        </h2>
        <div className="mt-3 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. My script"
            maxLength={40}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none"
          />
          <button onClick={create} disabled={busy} className="btn-primary shrink-0 !py-2.5 text-sm">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Max 5 active keys. Keys call the API as you, with your plan.</p>
      </div>

      <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white">Your keys</h2>
        <div className="mt-3 space-y-1.5">
          {keys === null && <p className="text-xs text-zinc-500">Loading…</p>}
          {keys?.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/40 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-100">{k.name.replace(/^Human AI API:\s*/, "")}</p>
                <p className="font-mono text-[11px] text-zinc-500">
                  {k.prefix}… · {k.usage_count ?? 0} calls
                  {k.last_used_at ? ` · used ${new Date(k.last_used_at).toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              <button onClick={() => revoke(k.id)} className="text-zinc-500 transition-colors hover:text-accent" aria-label="Revoke key">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {keys?.length === 0 && <p className="text-xs text-zinc-500">No keys yet.</p>}
        </div>
      </div>

      <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white">Use it</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Full reference with streaming examples:{" "}
          <a href="/platform/api/docs" className="text-white underline underline-offset-4 hover:no-underline">
            API Documentation
          </a>
        </p>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/60 p-4 font-mono text-xs leading-5 text-zinc-300">{`curl https://usehuman.de/api/chat \\
  -H "x-api-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"modelId":"humi1.1-speed","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        <p className="mt-2 text-xs text-zinc-500">
          Streams Server-Sent Events (<code className="font-mono">data: {"{token}"}</code>). Responses follow your plan limits.
        </p>
      </div>
    </div>
  );
}

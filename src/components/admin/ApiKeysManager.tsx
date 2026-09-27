"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";

interface K { id: string; user_id: string; owner: string; name: string; prefix: string; enabled: boolean; usage_count: number; last_used_at: string | null; created_at: string }

export function ApiKeysManager() {
  const [keys, setKeys] = useState<K[]>([]);
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/api-keys");
    const j = await res.json();
    setKeys(j.keys ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function issue() {
    if (!userId.trim()) {
      show("User ID required.");
      return;
    }
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId.trim(), name: name.trim() || "API key" }),
    });
    const j = await res.json();
    if (!res.ok) {
      show(j?.error ?? "Failed.");
      return;
    }
    setSecret(j.secret);
    setUserId("");
    setName("");
    load();
  }

  async function setEnabled(id: string, enabled: boolean) {
    await fetch("/api/admin/api-keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) });
    load();
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/api-keys?id=${id}`, { method: "DELETE" });
    show("Revoked.");
    load();
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      {secret && (
        <div className="card border-accent/40 p-4">
          <p className="text-sm font-semibold text-white">New secret — copy it now. It will never be shown again.</p>
          <p className="mt-2 break-all rounded-lg bg-black p-3 font-mono text-[13px] text-accent">{secret}</p>
          <button onClick={() => setSecret(null)} className="btn-ghost mt-2 text-xs">I saved it — hide</button>
        </div>
      )}
      <div className="card flex flex-wrap gap-2 p-4">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Owner user ID…" className="input !w-auto flex-1" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name…" className="input !w-auto" />
        <button onClick={issue} className="btn-primary text-xs">Issue key</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-ink-800/60 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="text-white">{k.name}</p>
                  <p className="font-mono text-xs text-zinc-500">{k.prefix}… · {new Date(k.created_at).toLocaleDateString()}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{k.owner}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{k.usage_count}×{k.last_used_at ? ` · ${new Date(k.last_used_at).toLocaleDateString()}` : ""}</td>
                <td className="px-4 py-2.5"><StatusPill value={k.enabled ? "active" : "disabled"} tone={k.enabled ? "green" : "gray"} /></td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setEnabled(k.id, !k.enabled)} className="btn-ghost !px-2.5 !py-1 text-xs">
                      {k.enabled ? "Disable" : "Enable"}
                    </button>
                    <ConfirmButton onConfirm={() => revoke(k.id)} confirmText="Revoke?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                      <span className="text-xs">Revoke</span>
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && <EmptyState text="No API keys issued." />}
      </div>
    </div>
  );
}

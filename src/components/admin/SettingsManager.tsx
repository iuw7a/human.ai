"use client";

import { useEffect, useState } from "react";
import { StatusPill, useToast } from "@/components/admin/ui";

export function SettingsManager() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/settings");
    const j = await res.json();
    setName(j.profile?.name ?? "");
    setEmail(j.profile?.email ?? "");
    setConfig(j.config ?? {});
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    show(res.ok ? "Profile saved." : "Failed.");
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <form onSubmit={save} className="card space-y-3 p-5">
        <h2 className="text-sm font-semibold text-white">Admin profile</h2>
        <div>
          <label className="label">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Email (managed in Supabase Auth)</label>
          <input value={email} disabled readOnly className="input opacity-60" />
        </div>
        <button type="submit" className="btn-primary text-xs">Save</button>
      </form>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white">System configuration</h2>
        <p className="mb-3 text-xs text-zinc-500">Presence only — values and secrets are never exposed.</p>
        {Object.entries(config).map(([k, v]) => (
          <p key={k} className="flex items-center justify-between border-b border-ink-800/50 py-2 font-mono text-xs last:border-0">
            <span className="text-zinc-400">{k}</span>
            <StatusPill value={String(v)} tone="gray" />
          </p>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white">Credentials</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Passwords are hashed by Supabase Auth and can be changed via a password-reset email
          (Email Center) or directly in the Supabase dashboard. They are never stored or shown here.
        </p>
      </div>
    </div>
  );
}

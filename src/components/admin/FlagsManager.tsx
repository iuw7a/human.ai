"use client";

import { useEffect, useState } from "react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Flag { key: string; enabled: boolean; description: string }

export function FlagsManager() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/flags");
    const j = await res.json();
    setFlags(j.flags ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(f: Flag) {
    const res = await fetch("/api/admin/flags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: f.key, enabled: !f.enabled }),
    });
    show(res.ok ? `${f.key} ${!f.enabled ? "enabled" : "disabled"}.` : "Failed.");
    if (res.ok) load();
  }

  return (
    <div className="space-y-2">
      {ToastEl}
      {flags.map((f) => (
        <div key={f.key} className="card flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm text-white">{f.key}</p>
            <p className="truncate text-xs text-zinc-500">{f.description}</p>
          </div>
          <StatusPill value={f.enabled ? "on" : "off"} tone={f.enabled ? "green" : "gray"} />
          <button
            onClick={() => toggle(f)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${f.enabled ? "bg-accent" : "bg-ink-600"}`}
            aria-label={`Toggle ${f.key}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${f.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      ))}
      {flags.length === 0 && <EmptyState text="No flags." />}
      <p className="text-[11px] text-zinc-600">Security-relevant flags are enforced server-side (middleware, API routes).</p>
    </div>
  );
}

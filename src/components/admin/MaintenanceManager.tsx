"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, useToast } from "@/components/admin/ui";

export function MaintenanceManager() {
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState("");
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/maintenance");
    const j = await res.json();
    setOn(!!j.on);
    setMessage(j.message ?? "");
  }
  useEffect(() => {
    load();
  }, []);

  async function save(next: boolean) {
    const res = await fetch("/api/admin/maintenance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: next, message }),
    });
    show(res.ok ? (next ? "Maintenance ON — users see the maintenance page." : "Maintenance OFF.") : "Failed.");
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card flex items-center gap-4 p-5">
        <div className="flex-1">
          <p className="font-medium text-white">Maintenance mode</p>
          <p className="mt-0.5 text-sm text-zinc-500">
            Normal users see a maintenance page (enforced server-side). Admins keep full access.
          </p>
        </div>
        <StatusPill value={on ? "ACTIVE" : "off"} tone={on ? "red" : "green"} />
        {on ? (
          <ConfirmButton onConfirm={() => save(false)} confirmText="Disable maintenance?" className="btn-primary !text-xs">
            <span className="text-xs">Disable</span>
          </ConfirmButton>
        ) : (
          <ConfirmButton onConfirm={() => save(true)} confirmText="Enable maintenance?" className="btn-ghost border border-ink-700 !text-xs">
            <span className="text-xs">Enable</span>
          </ConfirmButton>
        )}
      </div>
      <div className="card space-y-2 p-5">
        <h2 className="text-sm font-semibold text-white">Maintenance message</h2>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="input" />
        <button onClick={() => save(on)} className="btn-ghost border border-ink-700 text-xs">Save message</button>
      </div>
    </div>
  );
}

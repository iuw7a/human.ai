"use client";

import { useState } from "react";

export function ApproveForm({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/desktop/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, approve }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      setDone(approve ? "approved" : "denied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
        <p className="text-lg font-semibold text-white">
          {done === "approved" ? "Desktop connected" : "Login denied"}
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          {done === "approved"
            ? "Return to the Human AI desktop app and finish setup."
            : "The desktop app was not granted access. You can close this tab."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900 p-6">
      <p className="text-center font-mono text-3xl font-bold tracking-[0.2em] text-white">{code}</p>
      <p className="mt-3 text-center text-sm text-zinc-400">
        The Human AI desktop app on your computer wants to connect to this account.
        Only approve if you just started the app yourself.
      </p>
      {error && (
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-center text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <button onClick={() => void decide(false)} disabled={busy} className="btn-ghost flex-1 border border-ink-600">
          Deny
        </button>
        <button onClick={() => void decide(true)} disabled={busy} className="btn-primary flex-1">
          {busy ? "…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

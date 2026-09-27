"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

export default function SetupPage() {
  const [status, setStatus] = useState<{ ready?: boolean; reason?: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ ready: false, reason: "Unreachable." }));
  }, []);

  async function bootstrap() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/setup/bootstrap", { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    setResult(res.ok ? `Created: ${(j?.created ?? []).join(", ")}` : (j?.error ?? "Failed."));
    if (res.ok) setStatus({ ready: false });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-xl font-semibold text-white">Development setup</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Creates the dev admin accounts (Admin.a / admin). Only works while no
          administrator exists.
        </p>
        <div className="card mt-6 space-y-3 p-6">
          {status === null && <p className="text-sm text-zinc-400">Checking…</p>}
          {status && !status.ready && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">
              {status.reason ?? "Already bootstrapped — log in instead."}
            </p>
          )}
          {status?.ready && (
            <button onClick={bootstrap} disabled={busy} className="btn-primary w-full">
              {busy ? "Creating…" : "Create dev admin accounts"}
            </button>
          )}
          {result && <p className="text-[13px] text-zinc-300">{result}</p>}
          <Link href="/login" className="btn-ghost w-full text-sm">
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}

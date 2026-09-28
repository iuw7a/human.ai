"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Loader2, Plug, Check, KeyRound, Globe } from "lucide-react";
import type { McpServer } from "@/lib/mcp/catalog";

export function ConnectDialog({
  server,
  isLoggedIn,
  initialCustomUrl = false,
  onClose,
  onDone,
}: {
  server: Pick<McpServer, "id" | "name" | "transport" | "server_url" | "auth_type">;
  isLoggedIn: boolean;
  initialCustomUrl?: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [credential, setCredential] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [showCustom, setShowCustom] = useState(initialCustomUrl);

  if (!isLoggedIn) {
    return (
      <DialogShell onClose={onClose} title={`Connect ${server.name}`}>
        <p className="text-sm leading-6 text-zinc-300">
          Log in to Human AI first — connections belong to your account.
        </p>
        <a href="/login" className="btn-primary mt-4 w-full">
          Log in
        </a>
      </DialogShell>
    );
  }

  const needsCredential = server.auth_type === "api_key" || server.auth_type === "oauth";
  const needsUrl = !server.server_url || showCustom || server.transport === "local";

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: server.id,
          api_key: server.auth_type === "api_key" ? credential.trim() : undefined,
          access_token: server.auth_type === "oauth" ? credential.trim() : undefined,
          custom_url: showCustom || server.transport === "local" ? customUrl.trim() || undefined : undefined,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Connect failed (${res.status}).`);
      setDone(j.tools ?? []);
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <DialogShell onClose={onClose} title={`${server.name} connected`}>
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <Check size={16} /> Connected — {done.length} tool{done.length === 1 ? "" : "s"} available in chat.
        </p>
        {done.length > 0 && (
          <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {done.map((t) => (
              <code key={t} className="rounded-md bg-ink-700 px-2 py-1 font-mono text-xs text-zinc-200">
                {t}
              </code>
            ))}
          </div>
        )}
        <a href="/" className="btn-primary mt-4 w-full">
          Return to Human AI
        </a>
      </DialogShell>
    );
  }

  return (
    <DialogShell onClose={onClose} title={`Connect ${server.name}`}>
      {error && (
        <p className="mb-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">
          {error}
        </p>
      )}

      {server.transport === "local" && !showCustom && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] leading-6 text-amber-200">
          <b>Local server.</b> {server.name} runs on your own machine (e.g. inside Blender) —
          Human AI Cloud can&apos;t reach it directly. Install it locally, or expose it over a
          reachable Streamable-HTTP URL and use “Custom endpoint” below.
        </div>
      )}

      {server.auth_type === "api_key" && (
        <div className="mb-3">
          <label className="label" htmlFor="mcp-key">
            <span className="inline-flex items-center gap-1.5"><KeyRound size={12} /> API key</span>
          </label>
          <input
            id="mcp-key"
            type="password"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder="Paste your API key…"
            className="input font-mono"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">Encrypted and stored for your account only.</p>
        </div>
      )}

      {server.auth_type === "oauth" && (
        <div className="mb-3">
          <label className="label" htmlFor="mcp-token">
            <span className="inline-flex items-center gap-1.5"><KeyRound size={12} /> Access token</span>
          </label>
          <input
            id="mcp-token"
            type="password"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            placeholder="Paste the access token from the provider…"
            className="input font-mono"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Complete authorization on the provider&apos;s site, then paste the token here. It is
            encrypted and stored for your account only.
          </p>
        </div>
      )}

      {(showCustom || server.transport === "local") && (
        <div className="mb-3">
          <label className="label" htmlFor="mcp-url">
            <span className="inline-flex items-center gap-1.5"><Globe size={12} /> Custom endpoint URL</span>
          </label>
          <input
            id="mcp-url"
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://your-server.example/mcp"
            className="input font-mono !text-[13px]"
          />
          <p className="mt-1 text-xs text-zinc-500">Human AI verifies the endpoint speaks MCP before connecting.</p>
        </div>
      )}

      {server.transport === "remote" && server.server_url && !showCustom && (
        <button
          onClick={() => setShowCustom(true)}
          className="mb-3 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
        >
          Use a custom endpoint instead
        </button>
      )}

      <button onClick={connect} disabled={busy} className="btn-primary w-full">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
        {busy ? "Verifying endpoint…" : "Connect"}
      </button>
      <p className="mt-2 text-center text-xs text-zinc-600">
        Human AI probes the endpoint first — nothing is saved unless it responds.
      </p>
    </DialogShell>
  );
}

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="card relative w-full max-w-md p-6 shadow-2xl animate-menu-in">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <h2 className="pr-6 text-lg font-semibold text-white">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

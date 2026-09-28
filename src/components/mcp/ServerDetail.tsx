"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ExternalLink, Loader2, Plug, Trash2 } from "lucide-react";
import { ConnectDialog } from "@/components/mcp/ConnectDialog";
import type { McpServer } from "@/lib/mcp/catalog";

export function ServerDetail({
  server,
  tools,
  liveOk,
  myStatus,
  isLoggedIn,
}: {
  server: McpServer;
  tools: { name: string; description: string }[];
  liveOk: boolean;
  myStatus: string | null;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm(`Disconnect ${server.name}? Stored credentials are destroyed.`)) return;
    setBusy(true);
    await fetch(`/api/mcp/connections?server_id=${server.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink-800 text-2xl font-semibold text-white ring-1 ring-ink-700">
          {(server.name[0] ?? "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{server.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {server.category} · {server.transport === "remote" ? "Cloud endpoint" : "Local setup"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {myStatus === "connected" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                <Check size={12} /> Connected
              </span>
            ) : myStatus ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">
                {myStatus}
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs font-medium text-zinc-400 ring-1 ring-zinc-500/30">
                Not connected
              </span>
            )}
            {liveOk && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-zinc-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live endpoint verified
              </span>
            )}
            {myStatus === "connected" ? (
              <button onClick={disconnect} disabled={busy} className="btn-ghost border border-ink-700 !px-3 !py-1.5 text-xs hover:!text-accent">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Disconnect
              </button>
            ) : (
              <button onClick={() => setDialog(true)} className="btn-primary !px-4 !py-1.5 text-xs">
                <Plug size={13} /> Connect
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-5 max-w-2xl text-[15px] leading-7 text-zinc-300">{server.description}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {server.homepage && (
          <a href={server.homepage} target="_blank" rel="noopener noreferrer" className="chip">
            Homepage <ExternalLink size={12} />
          </a>
        )}
        {server.repository && (
          <a href={server.repository} target="_blank" rel="noopener noreferrer" className="chip">
            Repository <ExternalLink size={12} />
          </a>
        )}
        {server.server_url && (
          <span className="chip font-mono !text-xs">{server.server_url}</span>
        )}
      </div>

      {server.transport === "local" && server.installation_md && (
        <div className="card mt-6 max-w-2xl p-5">
          <h2 className="text-sm font-semibold text-white">Local setup guide</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
            {server.installation_md}
          </p>
        </div>
      )}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-white">
        Tools {tools.length > 0 && <span className="text-zinc-500">({tools.length})</span>}
      </h2>
      {tools.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {server.transport === "local"
            ? "Tool list appears after you connect a reachable endpoint."
            : "Could not fetch the live tool list right now."}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tools.map((t) => (
            <div key={t.name} className="card p-3">
              <code className="font-mono text-[13px] text-white">{t.name}</code>
              {t.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{t.description}</p>}
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <ConnectDialog
          server={server}
          isLoggedIn={isLoggedIn}
          initialCustomUrl={server.transport === "local"}
          onClose={() => setDialog(false)}
          onDone={() => setDialog(false)}
        />
      )}
    </div>
  );
}

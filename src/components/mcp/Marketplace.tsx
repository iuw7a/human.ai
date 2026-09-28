"use client";

import { useMemo, useState } from "react";
import { Search, Check, Plug, Server } from "lucide-react";
import { ConnectDialog } from "./ConnectDialog";
import type { McpTransport, McpAuthType } from "@/lib/mcp/catalog";

export interface CatalogServer {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: string;
  repository: string | null;
  homepage: string | null;
  server_url: string | null;
  transport: McpTransport;
  auth_type: McpAuthType;
  featured: boolean;
  connections: number;
  myStatus: string | null;
}

function ServerAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-base font-semibold text-white ring-1 ring-ink-700">
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
        <Check size={11} /> Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-zinc-500/30">
      Not connected
    </span>
  );
}

function ServerCard({
  server,
  onConnect,
}: {
  server: CatalogServer;
  onConnect: (s: CatalogServer) => void;
}) {
  return (
    <div className="card group flex flex-col p-4 transition-colors hover:border-ink-600">
      <div className="flex items-start gap-3">
        <ServerAvatar name={server.name} />
        <div className="min-w-0 flex-1">
          <a href={`/mcp/${server.id}`} className="truncate text-[15px] font-semibold text-white hover:text-accent">
            {server.name}
          </a>
          <p className="mt-0.5 text-xs text-zinc-500">{server.category}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-zinc-400">
        {server.description}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={server.myStatus} />
        {server.myStatus === "connected" ? (
          <a href={`/mcp/${server.id}`} className="btn-ghost border border-ink-700 !px-3 !py-1.5 text-xs">
            Manage
          </a>
        ) : (
          <button onClick={() => onConnect(server)} className="btn-primary !px-3 !py-1.5 text-xs">
            <Plug size={13} /> Connect
          </button>
        )}
      </div>
    </div>
  );
}

export function Marketplace({
  servers,
  categories,
  featured,
  isLoggedIn,
}: {
  servers: CatalogServer[];
  categories: string[];
  featured: CatalogServer[];
  isLoggedIn: boolean;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [dialog, setDialog] = useState<CatalogServer | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return servers.filter(
      (x) =>
        (cat === "all" || x.category === cat) &&
        (!s ||
          x.name.toLowerCase().includes(s) ||
          x.description.toLowerCase().includes(s) ||
          x.id.toLowerCase().includes(s))
    );
  }, [servers, q, cat]);

  const popular = useMemo(
    () => [...servers].sort((a, b) => b.connections - a.connections).slice(0, 4),
    [servers]
  );
  const showPopular = popular.some((p) => p.connections > 0);

  return (
    <div>
      <div className="relative mb-4">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search MCP servers…"
          className="input !rounded-xl !py-2.5 !pl-10"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {["all", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
              cat === c
                ? "bg-white font-medium text-zinc-900"
                : "border border-ink-700 text-zinc-400 hover:border-ink-600 hover:text-white"
            }`}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      {featured.length > 0 && cat === "all" && !q && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-white">Featured</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((s) => (
              <ServerCard key={s.id} server={s} onConnect={setDialog} />
            ))}
          </div>
        </section>
      )}

      {showPopular && cat === "all" && !q && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-white">Popular right now</h2>
          <p className="-mt-2 mb-3 text-xs text-zinc-500">Ranked by real Human AI connections.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((s) => (
              <div key={s.id} className="card flex items-center gap-3 p-3">
                <ServerAvatar name={s.name} />
                <div className="min-w-0 flex-1">
                  <a href={`/mcp/${s.id}`} className="truncate text-sm font-medium text-white hover:text-accent">
                    {s.name}
                  </a>
                  <p className="text-xs text-zinc-500">
                    {s.connections} connection{s.connections === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">
          All servers {filtered.length !== servers.length && `(${filtered.length})`}
        </h2>
        {filtered.length === 0 ? (
          <div className="card flex flex-col items-center p-10 text-center">
            <Server size={22} className="text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">No MCP servers match your search.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <ServerCard key={s.id} server={s} onConnect={setDialog} />
            ))}
          </div>
        )}
      </section>

      {dialog && (
        <ConnectDialog server={dialog} isLoggedIn={isLoggedIn} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

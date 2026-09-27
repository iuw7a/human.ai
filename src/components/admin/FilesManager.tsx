"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";

interface Row { id: string; user_id: string; owner: string; storage_path: string; mime_type: string; size_bytes: number; chat_id: string | null; created_at: string }

export function FilesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const { show, ToastEl } = useToast();

  async function load() {
    const p = new URLSearchParams({ q, type });
    const res = await fetch(`/api/admin/files?${p.toString()}`);
    const j = await res.json();
    setRows(j.rows ?? []);
    setTotal(j.totalBytes ?? 0);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(id: string) {
    const res = await fetch(`/api/admin/files?id=${id}`, { method: "DELETE" });
    show(res.ok ? "File deleted." : "Failed.");
    if (res.ok) load();
  }

  const fmt = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

  return (
    <div>
      {ToastEl}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search path or chat ID…" className="input !pl-8" />
        </form>
        <select value={type} onChange={(e) => { setType(e.target.value); }} className="input !w-auto">
          <option value="all">All types</option>
          <option value="image/">Images</option>
        </select>
        <button onClick={load} className="btn-primary text-xs">Search</button>
        <span className="text-xs text-zinc-500">Total: {fmt(total)}</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-800/60 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="truncate font-mono text-xs text-zinc-200">{r.storage_path}</p>
                  <p className="text-[11px] text-zinc-500">{r.mime_type || "unknown"} · chat {r.chat_id ?? "—"}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{r.owner}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{fmt(r.size_bytes ?? 0)}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <ConfirmButton onConfirm={() => remove(r.id)} confirmText="Delete file?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                    <span className="text-xs">Delete</span>
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState text="No files found." />}
      </div>
    </div>
  );
}

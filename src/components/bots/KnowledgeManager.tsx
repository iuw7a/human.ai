"use client";

import { useEffect, useState } from "react";
import { FileUp, Link2, Loader2, Plus, Trash2 } from "lucide-react";

interface Entry {
  id: string;
  kind: string;
  title: string;
  created_at: string;
}

/** Owner-side knowledge manager: text notes, links, file uploads. */
export function KnowledgeManager({ slug }: { slug: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/bots/${slug}/knowledge`);
    const j = await res.json().catch(() => null);
    if (res.ok) setEntries(j.entries ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function addText() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bots/${slug}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "text", title: content.slice(0, 60), content }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addUrl() {
    const content = url.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bots/${slug}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "url", title: content.slice(0, 120), content }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      setUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const res = await fetch(`/api/bots/${slug}/knowledge`, { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/bots/${slug}/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Add a note your bot should know…"
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none"
        />
        <button onClick={addText} disabled={busy || !text.trim()} className="btn-primary mt-2 !py-1.5 text-[13px]">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add note
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none"
        />
        <button onClick={addUrl} disabled={busy || !url.trim()} className="btn-ghost shrink-0 border border-white/10 !py-2 text-[13px]">
          <Link2 size={14} /> Add link
        </button>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[13px] text-zinc-300 transition-colors hover:text-white">
          <FileUp size={14} /> File
          <input type="file" className="hidden" accept=".txt,.md,.pdf,.doc,.docx" onChange={(e) => addFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="space-y-1.5">
        {entries === null && <p className="text-xs text-zinc-500">Loading…</p>}
        {entries?.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/40 px-3.5 py-2.5">
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-400">{e.kind}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{e.title}</span>
            <button onClick={() => remove(e.id)} className="text-zinc-500 hover:text-accent" aria-label="Delete entry">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {entries?.length === 0 && <p className="text-xs text-zinc-500">No knowledge yet.</p>}
      </div>
    </div>
  );
}

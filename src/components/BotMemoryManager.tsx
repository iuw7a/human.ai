"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Brain } from "lucide-react";

interface Memory {
  id: string;
  content: string;
  created_at: string;
}

export function BotMemoryManager({ slug, memoryEnabled }: { slug: string; memoryEnabled: boolean }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/bots/${slug}/memories`);
    const j = await res.json().catch(() => null);
    setMemories(j?.memories ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bots/${slug}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.trim() }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) setError(j?.error ?? "Could not save.");
    else {
      setText("");
      load();
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch(`/api/bots/${slug}/memories?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {!memoryEnabled && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Bot memory is off. Enable it in Customize to let the Bot learn automatically.
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Teach ${"your Bot"} something it should always remember…`}
          className="input"
          maxLength={1000}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary shrink-0 text-xs">
          <Plus size={14} /> Teach
        </button>
      </form>
      {loading && <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>}
      {!loading && memories.length === 0 && (
        <div className="card p-8 text-center">
          <Brain size={22} className="mx-auto text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-400">No memories yet. Everything the Bot learns lives here, per Bot.</p>
        </div>
      )}
      <div className="space-y-1.5">
        {memories.map((m) => (
          <div key={m.id} className="card group flex items-start gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-200">{m.content}</p>
            <button
              onClick={() => remove(m.id)}
              className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:bg-accent/15 hover:text-accent"
              aria-label="Forget"
              title="Forget this"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

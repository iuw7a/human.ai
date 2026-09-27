"use client";

import { useState } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Memory {
  id: string;
  content: string;
  created_at: string;
}

export function MemoryManager({ initial }: { initial: Memory[] }) {
  const [memories, setMemories] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const supabase = createClient();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("Not signed in.");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("memories")
      .insert({ user_id: user.id, content: draft.trim() })
      .select("id,content,created_at")
      .single();
    setBusy(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setMemories((m) => [data, ...m]);
    setDraft("");
    setStatus(null);
  }

  async function remove(id: string) {
    await supabase.from("memories").delete().eq("id", id);
    setMemories((m) => m.filter((x) => x.id !== id));
  }

  async function clearAll() {
    if (!confirm("Delete all memories?")) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("memories").delete().eq("user_id", user.id);
    setMemories([]);
  }

  return (
    <div>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Remember that I prefer concise answers…"
          className="input"
          maxLength={2000}
        />
        <button type="submit" disabled={busy || !draft.trim()} className="btn-primary shrink-0">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add
        </button>
      </form>
      {status && <p className="mt-2 text-[13px] text-zinc-400">{status}</p>}

      <div className="mt-6 space-y-2">
        {memories.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">
            No memories stored yet. Human AI will be able to use these to
            personalize answers in the future.
          </p>
        )}
        {memories.map((m) => (
          <div key={m.id} className="card flex items-start gap-3 px-4 py-3">
            <p className="flex-1 text-sm leading-6 text-zinc-200">{m.content}</p>
            <button
              onClick={() => remove(m.id)}
              className="btn-ghost p-1.5 text-zinc-500 hover:text-accent"
              aria-label="Delete memory"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {memories.length > 0 && (
        <button
          onClick={clearAll}
          className="mt-4 text-[13px] text-zinc-500 hover:text-accent"
        >
          Delete all memories
        </button>
      )}
    </div>
  );
}

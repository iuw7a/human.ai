"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

const CATEGORIES = ["General", "Coding", "Education", "Research", "Creativity", "Analysis", "Productivity", "Fun"];

/** Owner extras: visibility, category, delete. */
export function EditExtras({
  slug,
  name,
  initialVisibility,
  initialCategory,
}: {
  slug: string;
  name: string;
  initialVisibility: string;
  initialCategory: string;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [category, setCategory] = useState(initialCategory);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/bots/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility, category }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed.");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${name}" and all its conversations?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bots/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      router.push("/bots/mine");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="text-sm font-semibold text-white">Publishing</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["private", "Private", "Only you"],
              ["unlisted", "Unlisted", "Anyone with the link"],
              ["public", "Public", "Listed in Bots"],
            ] as const
          ).map(([v, label, hint]) => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                visibility === v ? "border-accent/60 bg-accent/10" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span className="block text-sm font-semibold text-white">{label}</span>
              <span className="block text-xs text-zinc-500">{hint}</span>
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-[#101014] px-4 py-2.5 text-sm text-zinc-100 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary mt-3 !py-2 text-sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : saved ? "Saved ✓" : "Save publishing"}
        </button>
      </div>

      <div className="rounded-[22px] border border-accent/30 bg-accent/[0.04] p-5">
        <h2 className="text-sm font-semibold text-red-200">Danger zone</h2>
        <p className="mt-1 text-xs text-zinc-400">Deleting removes the bot, its conversations and files.</p>
        <button
          onClick={remove}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-accent/40 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-accent/15 disabled:opacity-50"
        >
          <Trash2 size={14} /> Delete {name}
        </button>
      </div>
    </div>
  );
}

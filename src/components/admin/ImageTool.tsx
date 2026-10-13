"use client";

import { useState } from "react";
import { ArrowUp, ImagePlus, Loader2 } from "lucide-react";

/** Admin image studio: prompt bar + result. Server does the generation. */
export function ImageTool() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tools/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, size }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Generation failed.");
      setImageUrl(j.imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {imageUrl && (
        <div className="mb-5 overflow-hidden rounded-[22px] border border-white/[0.08] bg-black shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={prompt.slice(0, 80)} className="max-h-[60vh] w-full object-contain" />
        </div>
      )}
      {error && (
        <p className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}
      <div className="rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="Describe the image… (Enter to generate)"
          aria-label="Image prompt"
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-2 px-1">
          <ImagePlus size={16} className="text-zinc-500" />
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="rounded-xl border border-white/10 bg-transparent px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
            title="Image size"
          >
            {["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280"].map((s) => (
              <option key={s} value={s} className="bg-ink-900">{s}</option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            onClick={() => void submit()}
            disabled={busy || !prompt.trim()}
            className="btn-send !h-10 !w-10"
            aria-label="Generate image"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        {busy ? "Generating with Agnes Image 2.1…" : "agnes-image-2.1-flash · key stays server-side"}
      </p>
    </div>
  );
}

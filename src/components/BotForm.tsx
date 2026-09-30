"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Check, X, Star } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "@/lib/bots";

interface McpConn {
  server_id: string;
  server?: { name?: string };
}

interface GalleryItem {
  key: string;
  id?: string;
  preview: string;
  file?: File;
  primary: boolean;
}

const ACCENTS = ["#e5484d", "#f2555a", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];
const MAX_IMAGES = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, 30);
}

export function BotForm({ bot, mode }: { bot?: Bot; mode: "create" | "edit" }) {
  const router = useRouter();
  const [name, setName] = useState(bot?.name ?? "");
  const [slug, setSlug] = useState(bot?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!bot);
  const [description, setDescription] = useState(bot?.description ?? "");
  const [personality, setPersonality] = useState(bot?.personality ?? "");
  const [instructions, setInstructions] = useState(bot?.instructions ?? "");
  const [memoryEnabled, setMemoryEnabled] = useState(bot?.memory_enabled ?? true);
  const [includeUserMemory, setIncludeUserMemory] = useState(bot?.include_user_memory ?? false);
  const [webSearch, setWebSearch] = useState(bot?.tools.web_search ?? true);
  const [conns, setConns] = useState<McpConn[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>(bot?.tools.mcp_server_ids ?? []);
  const [accent, setAccent] = useState(bot?.theme.accent ?? "#e5484d");
  const [tts, setTts] = useState(bot?.voice.tts_enabled ?? false);
  const [stt, setStt] = useState(bot?.voice.stt_enabled ?? false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [imgError, setImgError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/mcp/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConns(j?.connections ?? []))
      .catch(() => {});
  }, []);

  // Edit mode: load persisted gallery.
  useEffect(() => {
    if (mode !== "edit" || !bot) return;
    fetch(`/api/bots/${bot.slug}/images`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) =>
        setGallery(
          ((j?.images ?? []) as { id: string; url: string; primary: boolean }[]).map((g) => ({
            key: g.id,
            id: g.id,
            preview: g.url,
            primary: g.primary,
          }))
        )
      )
      .catch(() => {});
  }, [mode, bot]);

  // Revoke queued object URLs on unmount.
  useEffect(() => {
    const snapshot = gallery;
    return () => {
      for (const g of snapshot) {
        if (g.file) URL.revokeObjectURL(g.preview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function validateFile(f: File): string | null {
    if (!ACCEPTED.includes(f.type)) return `"${f.name}": only PNG, JPEG, WebP or GIF.`;
    if (f.size > MAX_BYTES) return `"${f.name}": max 4 MB per image.`;
    if (f.size === 0) return `"${f.name}" is empty.`;
    return null;
  }

  /** Upload files immediately (edit mode) or queue them (create mode). */
  async function handleFiles(files: FileList | null) {
    setImgError(null);
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, MAX_IMAGES - gallery.length);
    if (picked.length === 0) {
      setImgError(`Max ${MAX_IMAGES} images per Bot. Remove one first.`);
      return;
    }
    for (const f of picked) {
      const problem = validateFile(f);
      if (problem) {
        setImgError(problem);
        return;
      }
    }
    if (mode === "create" || !bot) {
      setGallery((g) => [
        ...g,
        ...picked.map((f, i) => ({
          key: `new-${Date.now()}-${i}`,
          preview: URL.createObjectURL(f),
          file: f,
          primary: g.length === 0 && i === 0,
        })),
      ]);
      return;
    }
    // Edit mode: upload straight away so every thumbnail is persisted.
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of picked) form.append("files", f);
      const res = await fetch(`/api/bots/${bot.slug}/images`, { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Upload failed (${res.status}).`);
      const added = ((j.images ?? []) as { id: string; url: string }[]).map((a, i) => ({
        key: a.id,
        id: a.id,
        preview: a.url,
        primary: gallery.length === 0 && i === 0,
      }));
      setGallery((g) => [...g, ...added]);
      router.refresh();
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeItem(item: GalleryItem) {
    setImgError(null);
    if (item.file) {
      URL.revokeObjectURL(item.preview);
      setGallery((g) => {
        const rest = g.filter((x) => x.key !== item.key);
        if (item.primary && rest.length > 0) rest[0] = { ...rest[0], primary: true };
        return rest;
      });
      return;
    }
    if (!item.id || !bot) return;
    const res = await fetch(`/api/bots/${bot.slug}/images?id=${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setImgError(j?.error ?? "Could not remove image.");
      return;
    }
    setGallery((g) => g.filter((x) => x.key !== item.key));
    router.refresh();
  }

  async function makePrimary(item: GalleryItem) {
    if (!item.id || !bot || item.primary) return;
    const res = await fetch(`/api/bots/${bot.slug}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ make_primary: item.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setImgError(j?.error ?? "Could not set avatar.");
      return;
    }
    setGallery((g) => g.map((x) => ({ ...x, primary: x.key === item.key })));
    router.refresh();
  }

  /** Upload queued files after the Bot exists. */
  async function uploadQueued(targetSlug: string) {
    const queued = gallery.filter((g) => g.file);
    if (queued.length === 0) return;
    const form = new FormData();
    for (const g of queued) form.append("files", g.file as File);
    const res = await fetch(`/api/bots/${targetSlug}/images`, { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? `Image upload failed (${res.status}).`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        name: name.trim(),
        slug,
        description: description.trim(),
        personality: personality.trim(),
        instructions: instructions.trim(),
        memory_enabled: memoryEnabled,
        include_user_memory: includeUserMemory,
        tools: { web_search: webSearch, mcp_server_ids: mcpIds },
        theme: { accent },
        voice: { tts_enabled: tts, stt_enabled: stt },
      };
      if (mode === "create") {
        const res = await fetch("/api/bots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ? `${j.error} (${res.status})` : `Could not create Bot (${res.status}).`);
        await uploadQueued(j.bot.slug);
        router.push(`/bot/${j.bot.slug}`);
      } else if (bot) {
        const res = await fetch(`/api/bots/${bot.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ? `${j.error} (${res.status})` : `Could not save (${res.status}).`);
        setSaved(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
      setBusy(false);
    }
  }

  function toggleMcp(id: string) {
    setMcpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const primary = gallery.find((g) => g.primary) ?? gallery[0];

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}
      {saved && (
        <p className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          <Check size={15} /> Saved. Future conversations use the new settings.
        </p>
      )}

      <div className="card p-6">
        <div className="mb-3 flex items-center gap-4">
          <BotAvatar
            src={primary?.preview ?? null}
            name={name || "Bot"}
            size={72}
            accent={accent}
          />
          <div>
            <h2 className="text-sm font-semibold text-white">Bot images (up to {MAX_IMAGES})</h2>
            <p className="text-xs text-zinc-500">First image is the avatar. Click ☆ on any image to make it the avatar.</p>
          </div>
        </div>
        {imgError && (
          <p className="mb-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">{imgError}</p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {gallery.map((g) => (
            <div key={g.key} className={`group relative aspect-square overflow-hidden rounded-xl border ${g.primary ? "border-accent" : "border-ink-700"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.preview} alt="Bot image" className="h-full w-full object-cover" />
              {g.primary && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Avatar</span>
              )}
              <span className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                {!g.primary && (
                  <button
                    type="button"
                    onClick={() => makePrimary(g)}
                    className="rounded-full bg-black/70 p-1.5 text-amber-300 hover:bg-accent hover:text-white"
                    title={g.id ? "Set as avatar" : "First in queue becomes avatar — reorder by removing"}
                  >
                    <Star size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(g)}
                  className="rounded-full bg-black/70 p-1.5 text-white hover:bg-accent"
                  title="Remove image"
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
              </span>
            </div>
          ))}
          {gallery.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-600 text-zinc-500 transition-colors hover:border-ink-400 hover:text-white disabled:opacity-50"
            >
              <ImagePlus size={20} />
              <span className="px-2 text-center text-[11px] leading-4">
                {uploading ? "Uploading…" : gallery.length === 0 ? "Add images" : "Add more"}
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-[11px] text-zinc-600">PNG, JPEG, WebP or GIF · max 4 MB each · one by one or multiple at once</p>
      </div>

      <div className="card space-y-3 p-6">
        <div>
          <label className="label" htmlFor="bot-name">Bot name</label>
          <input id="bot-name" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Nova" className="input" maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="bot-slug">Bot ID / username</label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-zinc-500">/bot/</span>
            <input
              id="bot-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="nova"
              className="input font-mono"
              maxLength={30}
              disabled={mode === "edit"}
              title={mode === "edit" ? "Bot ID cannot be changed" : undefined}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bot-desc">Description</label>
          <input id="bot-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this Bot for?" className="input" maxLength={500} />
        </div>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white">Personality & instructions</h2>
        <div>
          <label className="label" htmlFor="bot-personality">Personality</label>
          <textarea id="bot-personality" value={personality} onChange={(e) => setPersonality(e.target.value)} rows={3} placeholder="e.g. Warm, witty, concise. Speaks German unless asked otherwise." className="input resize-y" maxLength={2000} />
        </div>
        <div>
          <label className="label" htmlFor="bot-instructions">Permanent system instructions</label>
          <textarea id="bot-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="Rules the Bot always follows…" className="input resize-y font-mono text-[13px]" maxLength={4000} />
        </div>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white">Memory</h2>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} className="mt-1 accent-[#e5484d]" />
          <span><span className="font-medium text-white">Bot memory</span><br /><span className="text-[13px] text-zinc-500">The Bot remembers facts about you across conversations (stored per Bot).</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={includeUserMemory} onChange={(e) => setIncludeUserMemory(e.target.checked)} className="mt-1 accent-[#e5484d]" />
          <span><span className="font-medium text-white">Include Human AI memory</span><br /><span className="text-[13px] text-zinc-500">Also use facts from your shared Human AI memory.</span></span>
        </label>
      </div>

      <div className="card space-y-3 p-6">
        <h2 className="text-sm font-semibold text-white">Tools & plugins</h2>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="accent-[#e5484d]" />
          Live web search
        </label>
        {conns.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Connected MCP servers</p>
            {conns.map((c) => (
              <label key={c.server_id} className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input type="checkbox" checked={mcpIds.includes(c.server_id)} onChange={() => toggleMcp(c.server_id)} className="accent-[#e5484d]" />
                {c.server?.name ?? c.server_id}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-zinc-500">No MCP servers connected. <a href="/mcp" className="text-zinc-300 underline underline-offset-2 hover:text-white">Browse marketplace</a></p>
        )}
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-sm font-semibold text-white">Theme & voice</h2>
        <div>
          <p className="label">Accent color</p>
          <div className="flex items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccent(c)}
                aria-label={c}
                className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${accent === c ? "ring-2 ring-white ring-offset-2 ring-offset-ink-900" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" title="Custom accent" />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} className="accent-[#e5484d]" />
          Read answers aloud (Desktop companion)
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input type="checkbox" checked={stt} onChange={(e) => setStt(e.target.checked)} className="accent-[#e5484d]" />
          Voice input (Desktop companion, when available)
        </label>
      </div>

      <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full py-3 text-sm sm:w-auto sm:px-8">
        {busy ? "Saving…" : mode === "create" ? "Create Human Bot" : "Save changes"}
      </button>
    </form>
  );
}

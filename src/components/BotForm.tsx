"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Check } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "@/lib/bots";

interface ModelOpt {
  id: string;
  name: string;
  vision: boolean;
  plan: string;
}

interface McpConn {
  server_id: string;
  server?: { name?: string };
}

const ACCENTS = ["#e5484d", "#f2555a", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899"];

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
  const [modelId, setModelId] = useState(bot?.model_id ?? "human-ai");
  const [models, setModels] = useState<ModelOpt[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(bot?.memory_enabled ?? true);
  const [includeUserMemory, setIncludeUserMemory] = useState(bot?.include_user_memory ?? false);
  const [webSearch, setWebSearch] = useState(bot?.tools.web_search ?? true);
  const [conns, setConns] = useState<McpConn[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>(bot?.tools.mcp_server_ids ?? []);
  const [accent, setAccent] = useState(bot?.theme.accent ?? "#e5484d");
  const [tts, setTts] = useState(bot?.voice.tts_enabled ?? false);
  const [stt, setStt] = useState(bot?.voice.stt_enabled ?? false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(bot?.avatar_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((j) => setModels(j.models ?? []))
      .catch(() => {});
    fetch("/api/mcp/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConns(j?.connections ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function uploadAvatar(targetSlug: string) {
    if (!avatarFile) return;
    const form = new FormData();
    form.append("file", avatarFile);
    const res = await fetch(`/api/bots/${targetSlug}/avatar`, { method: "POST", body: form });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? "Avatar upload failed.");
    setAvatarPreview(j.bot?.avatar_url ?? avatarPreview);
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
        model_id: modelId,
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
        if (!res.ok) throw new Error(j?.error ?? "Could not create Bot.");
        await uploadAvatar(j.bot.slug);
        router.push(`/bot/${j.bot.slug}`);
      } else if (bot) {
        const res = await fetch(`/api/bots/${bot.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? "Could not save.");
        await uploadAvatar(bot.slug);
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

      <div className="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <BotAvatar src={avatarPreview} name={name || "Bot"} size={96} accent={accent} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-ink-600 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-ink-500 hover:text-white"
          >
            <ImagePlus size={14} />
            {avatarFile ? avatarFile.name.slice(0, 18) : "Upload avatar"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setAvatarFile(f);
              e.target.value = "";
            }}
          />
          <p className="text-[11px] text-zinc-600">PNG/JPG/WebP/GIF, max 4 MB</p>
        </div>
        <div className="w-full flex-1 space-y-3">
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
        <h2 className="text-sm font-semibold text-white">Model & memory</h2>
        <div>
          <label className="label" htmlFor="bot-model">Model</label>
          <select id="bot-model" value={modelId} onChange={(e) => setModelId(e.target.value)} className="input">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.id}){m.plan === "plus" ? " · Pro" : ""}
              </option>
            ))}
          </select>
        </div>
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

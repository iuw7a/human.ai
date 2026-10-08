"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";

const CATEGORIES = ["General", "Coding", "Education", "Research", "Creativity", "Analysis", "Productivity", "Fun"];
const ACCENTS = ["#e5484d", "#f59e0b", "#34d399", "#38bdf8", "#a78bfa", "#f472b6"];

function normalizeSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-")
    .slice(0, 30);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none";

/** Full bot creator: identity, avatar, personality, knowledge, capabilities, visibility. */
export function CreatorForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [personality, setPersonality] = useState("");
  const [instructions, setInstructions] = useState("");
  const [knowledge, setKnowledge] = useState("");
  const [category, setCategory] = useState("General");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [webSearch, setWebSearch] = useState(true);
  const [memory, setMemory] = useState(true);
  const [tts, setTts] = useState(false);
  const [stt, setStt] = useState(true);
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(normalizeSlug(v));
  }

  async function submit() {
    setError(null);
    const finalSlug = normalizeSlug(slugTouched ? slug : name);
    if (!name.trim()) return setError("Give your bot a name.");
    if (finalSlug.length < 3) return setError("Username must be at least 3 characters (a-z, 0-9, dash).");
    setBusy(true);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: finalSlug,
          description: description.trim(),
          personality: personality.trim(),
          instructions: instructions.trim(),
          memory_enabled: memory,
          tools: { web_search: webSearch, mcp_server_ids: [] },
          theme: { accent },
          voice: { tts_enabled: tts, stt_enabled: stt },
          visibility,
          category,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Could not create bot.");
      const createdSlug = j.bot.slug as string;
      if (avatar) {
        const form = new FormData();
        form.append("file", avatar);
        await fetch(`/api/bots/${createdSlug}/avatar`, { method: "POST", body: form }).catch(() => {});
      }
      const notes = knowledge
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      for (const note of notes) {
        await fetch(`/api/bots/${createdSlug}/knowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "text", title: note.slice(0, 60), content: note }),
        }).catch(() => {});
      }
      router.push(`/bots/${createdSlug}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create bot.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bot name">
          <input value={name} onChange={(e) => onName(e.target.value)} placeholder="Math Helper" maxLength={60} className={inputCls} />
        </Field>
        <Field label="Username">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">@</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(normalizeSlug(e.target.value));
              }}
              placeholder="mathhelper"
              maxLength={30}
              className={`${inputCls} font-mono`}
            />
          </div>
        </Field>
      </div>
      <Field label="Short description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your bot do?" maxLength={500} className={inputCls} />
      </Field>
      <Field label="Avatar">
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:text-white">
            <ImagePlus size={16} /> {avatar ? avatar.name : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
            />
          </label>
          {avatar && (
            <button onClick={() => setAvatar(null)} className="text-zinc-500 hover:text-white" aria-label="Remove avatar">
              <X size={16} />
            </button>
          )}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Personality">
          <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={4} placeholder="Friendly, concise, encouraging…" className={`${inputCls} resize-none`} />
        </Field>
        <Field label="Instructions">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="Always reply in… Never do…" className={`${inputCls} resize-none`} />
        </Field>
      </div>
      <Field label="Knowledge (optional — blank line separates entries)">
        <textarea value={knowledge} onChange={(e) => setKnowledge(e.target.value)} rows={4} placeholder={"Paste facts, FAQs or docs your bot should know…"} className={`${inputCls} resize-none`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} bg-[#101014]`}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Accent color">
          <div className="flex items-center gap-2 pt-1">
            {ACCENTS.map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                aria-label={`Accent ${a}`}
                className={`h-8 w-8 rounded-full transition-transform ${accent === a ? "ring-2 ring-white ring-offset-2 ring-offset-black" : "hover:scale-110"}`}
                style={{ background: a }}
              />
            ))}
          </div>
        </Field>
      </div>
      <Field label="Capabilities">
        <div className="flex flex-wrap gap-2">
          {[
            { k: "web", label: "Web search", on: webSearch, set: setWebSearch },
            { k: "mem", label: "Memory", on: memory, set: setMemory },
            { k: "tts", label: "Read aloud", on: tts, set: setTts },
            { k: "stt", label: "Voice input", on: stt, set: setStt },
          ].map((c) => (
            <button
              key={c.k}
              onClick={() => c.set(!c.on)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                c.on ? "border-accent/50 bg-accent/15 text-white" : "border-white/10 text-zinc-400 hover:text-white"
              }`}
            >
              {c.on ? <Plus size={12} className="mr-1 inline rotate-45" /> : <Plus size={12} className="mr-1 inline" />}
              {c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Visibility">
        <div className="grid gap-2 sm:grid-cols-3">
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
      </Field>
      <button onClick={submit} disabled={busy} className="btn-primary w-full !py-3 text-[15px]">
        {busy ? (
          <>
            <Loader2 size={17} className="animate-spin" /> Creating…
          </>
        ) : (
          "Create Bot"
        )}
      </button>
    </div>
  );
}

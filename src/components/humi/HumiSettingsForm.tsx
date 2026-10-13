"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSISTANT_PERSONALITIES,
  ASSISTANT_LANGUAGES,
  AVATAR_PRESETS,
  MAX_AVATAR_UPLOAD_BYTES,
  type AssistantPersonality,
  type AssistantLanguage,
} from "@/lib/humi/validation";

export interface HumiFormValue {
  name: string;
  avatar_url: string;
  personality: AssistantPersonality;
  custom_instructions: string;
  language: AssistantLanguage;
  voice: "server";
  voice_enabled: boolean;
  model_id: string;
}

const PERSONALITY_LABEL: Record<string, string> = {
  friendly: "Friendly",
  professional: "Professional",
  funny: "Funny",
  calm: "Calm",
  custom: "Custom",
};

function segCls(on: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
    on
      ? "border-accent/60 bg-accent/15 text-white"
      : "border-ink-700 bg-ink-850 text-zinc-400 hover:text-zinc-100"
  }`;
}

/** Humi customization form: name, avatar, personality, instructions, language, voice, model. */
export function HumiSettingsForm({
  initial,
  models,
  onSave,
  onDelete,
}: {
  initial: HumiFormValue & { id: string };
  models: { id: string; name: string; description: string; allowed?: boolean; access_level?: string }[];
  onSave: (input: HumiFormValue) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [avatarSel, setAvatarSel] = useState(() =>
    (AVATAR_PRESETS as readonly string[]).includes(initial.avatar_url)
      ? initial.avatar_url
      : initial.avatar_url.startsWith("data:image/") || initial.avatar_url === ""
        ? initial.avatar_url
        : "custom"
  );
  const [avatarUrl, setAvatarUrl] = useState(() =>
    (AVATAR_PRESETS as readonly string[]).includes(initial.avatar_url) ||
    initial.avatar_url.startsWith("data:image/") ||
    initial.avatar_url === ""
      ? ""
      : initial.avatar_url
  );
  const [personality, setPersonality] = useState<AssistantPersonality>(initial.personality);
  const [instructions, setInstructions] = useState(initial.custom_instructions);
  const [language, setLanguage] = useState<AssistantLanguage>(initial.language);
  const [voiceEnabled, setVoiceEnabled] = useState(initial.voice_enabled);
  const [modelId, setModelId] = useState(initial.model_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const avatarValue = avatarSel === "custom" ? avatarUrl.trim() : avatarSel === "none" ? "" : avatarSel;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const ok = await onSave({
      name: name.trim() || initial.name,
      avatar_url: avatarValue,
      personality,
      custom_instructions: instructions.trim(),
      language,
      voice: "server",
      voice_enabled: voiceEnabled,
      model_id: modelId,
    });
    setSaving(false);
    if (!ok) {
      setError("Saving failed. Custom instructions must not contain secrets.");
      return;
    }
    setSaved(true);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (f.size > MAX_AVATAR_UPLOAD_BYTES) {
      setError("Image too large (max 256 KB for avatars). Use an image URL instead.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read-failed"));
      r.readAsDataURL(f);
    });
    setAvatarSel(dataUrl);
    setAvatarUrl("");
    setError(null);
  }

  async function remove() {
    if (!confirm(`Delete "${initial.name}" with all its conversations?`)) return;
    if (!(await onDelete())) {
      setError("Deleting failed.");
      return;
    }
    router.push("/urhumi");
    router.refresh();
  }

  const preview = avatarSel === "custom" ? avatarUrl.trim() : avatarSel === "none" ? "" : avatarSel;

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="humi-name">Name</label>
        <input id="humi-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input" placeholder="e.g. Alex" />
      </div>

      <div>
        <span className="label">Avatar</span>
        <div className="flex flex-wrap items-center gap-2">
          {["none", ...AVATAR_PRESETS, ...(avatarSel.startsWith("data:image/") ? [avatarSel] : []), "custom"].map((opt) => (
            <button
              key={opt.slice(0, 32)}
              type="button"
              onClick={() => setAvatarSel(opt)}
              className={segCls(avatarSel === opt || (opt === "custom" && !!avatarUrl && avatarSel === "custom"))}
            >
              {opt === "none" ? "None" : opt === "custom" ? "URL" : opt.startsWith("data:image/") || opt.startsWith("/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt} alt="" width={26} height={26} className="rounded-full object-cover" />
              ) : opt}
            </button>
          ))}
          <label className={segCls(false)} style={{ cursor: "pointer" }}>
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" width={40} height={40} className="rounded-full border border-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
        </div>
        {avatarSel === "custom" && (
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://… (image URL)" inputMode="url" className="input mt-2" />
        )}
        <p className="mt-1 text-xs text-zinc-500">Presets, image URL, or upload up to 256 KB.</p>
      </div>

      <div>
        <span className="label">Personality</span>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_PERSONALITIES.map((p) => (
            <button key={p} type="button" onClick={() => setPersonality(p)} className={segCls(personality === p)}>
              {PERSONALITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="humi-instructions">Custom instructions</label>
        <textarea
          id="humi-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={2000}
          rows={4}
          className="input resize-y"
          placeholder="Tell Humi how to behave and help you…"
        />
        <p className="mt-1 text-xs text-zinc-500">Max 2000 chars. No passwords or API keys — secrets are rejected.</p>
      </div>

      <div>
        <span className="label">Language</span>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_LANGUAGES.map((l) => (
            <button key={l} type="button" onClick={() => setLanguage(l)} className={segCls(language === l)}>{l}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">Answer language of this Humi. “auto” follows the conversation.</p>
      </div>

      <div>
        <span className="label">Voice</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={segCls(true)}>Server voice</button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Verified server text-to-speech (per-language voice, no key needed). No other voice provider is configured.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} className="accent-[#e5484d]" />
          Speak answers aloud
        </label>
      </div>

      <div>
        <label className="label" htmlFor="humi-model">Model</label>
        <select id="humi-model" value={modelId} onChange={(e) => setModelId(e.target.value)} className="input">
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={m.allowed === false}>
              {m.description || m.name}{m.allowed === false ? ` — upgrade required (${m.access_level ?? "premium"})` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">Real registry models only — the same engine as Human AI chats. Restricted options need Plus/Pro; the server re-verifies on every request.</p>
      </div>

      {error && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">{error}</p>
      )}
      {saved && <p className="text-[13px] text-emerald-300">Saved.</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => void remove()} className="btn-ghost border border-accent/40">
          Delete
        </button>
      </div>
    </div>
  );
}

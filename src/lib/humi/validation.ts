/** Humi assistant validation (shared by API routes + client forms). No deps. */

export const ASSISTANT_PERSONALITIES = ["friendly", "professional", "funny", "calm", "custom"] as const;
export type AssistantPersonality = (typeof ASSISTANT_PERSONALITIES)[number];

export const ASSISTANT_LANGUAGES = ["auto", "ar", "de", "en"] as const;
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number];

/**
 * Working voice options in this project: the verified server TTS chain
 * (POST /api/tts, language voice, no key required). No other voice provider
 * is configured, so "server" is the only selectable voice.
 */
export const ASSISTANT_VOICES = ["server"] as const;
export type AssistantVoice = (typeof ASSISTANT_VOICES)[number];

export const AVATAR_PRESETS = ["/humi.png", "/logo.webp"] as const;
export const MAX_AVATAR_CHARS = 400_000;
export const MAX_AVATAR_UPLOAD_BYTES = 256 * 1024;
export const MAX_ASSISTANTS_PER_USER = 10;

const SECRET_PATTERNS = [
  /password\s*[:=]/i,
  /passwort\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /bearer\s+[A-Za-z0-9\-_~+/]+=*/i,
  /sk-[A-Za-z0-9]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

function avatarOk(url: string): boolean {
  if (url === "") return true;
  if (url.length > MAX_AVATAR_CHARS) return false;
  if (url.startsWith("/")) return true;
  if (url.startsWith("data:image/")) return url.includes(";base64,");
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface AssistantInput {
  name: string;
  avatar_url: string;
  personality: AssistantPersonality;
  custom_instructions: string;
  language: AssistantLanguage;
  voice: AssistantVoice;
  voice_enabled: boolean;
  model_id: string;
}

export interface AssistantRecord extends AssistantInput {
  id: string;
  created_at?: string;
  updated_at?: string;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Never throws. Secrets in custom instructions are rejected like memory secrets. */
export function sanitizeAssistant(
  input: unknown
): { ok: true; value: AssistantInput } | { ok: false; reason: string; issues?: string[] } {
  if (!input || typeof input !== "object") return { ok: false, reason: "empty" };
  const raw = input as Record<string, unknown>;
  const issues: string[] = [];

  const name = str(raw.name, 80);
  if (!name) issues.push("name: required (1–80 chars)");

  const avatar_url = typeof raw.avatar_url === "string" ? raw.avatar_url.slice(0, MAX_AVATAR_CHARS) : "";
  if (!avatarOk(avatar_url)) issues.push("avatar_url: must be https URL, preset path, or small data:image");

  const personality = typeof raw.personality === "string" ? raw.personality : "friendly";
  if (!(ASSISTANT_PERSONALITIES as readonly string[]).includes(personality)) {
    issues.push("personality: unknown value");
  }

  const custom_instructions = str(raw.custom_instructions, 2000);
  if (custom_instructions && containsSecret(custom_instructions)) {
    return { ok: false, reason: "secret" };
  }

  const language = typeof raw.language === "string" ? raw.language : "auto";
  if (!(ASSISTANT_LANGUAGES as readonly string[]).includes(language)) {
    issues.push("language: must be auto, ar, de or en");
  }

  const voice = typeof raw.voice === "string" ? raw.voice : "server";
  if (!(ASSISTANT_VOICES as readonly string[]).includes(voice)) {
    issues.push("voice: only the verified server voice is available");
  }

  const model_id = str(raw.model_id, 80) || "humi1.1-speed";

  if (issues.length > 0) return { ok: false, reason: "invalid", issues };

  return {
    ok: true,
    value: {
      name,
      avatar_url,
      personality: personality as AssistantPersonality,
      custom_instructions,
      language: language as AssistantLanguage,
      voice: voice as AssistantVoice,
      voice_enabled: raw.voice_enabled !== false,
      model_id,
    },
  };
}

export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

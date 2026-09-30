import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  MAX_BOTS_PER_USER,
  normalizeSlug,
  resolveBotModel,
  toBot,
  userIsPro,
  validSlug,
} from "@/lib/bots";
import { defaultDbModelSlug } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "hbk_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LANGUAGES = ["Deutsch", "English", "Türkçe", "العربية", "Français", "Español"];

/**
 * POST /api/desktop/device/complete — finish desktop onboarding.
 * Body: {code, userName, aiName, accent, language, tts, stt}
 * Requires an approved, unexpired, unconsumed code. Creates the user's AI
 * companion bot (if none chosen), mints its companion key, consumes the code.
 * Returns the key ONCE.
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as {
    code?: string;
    userName?: string;
    aiName?: string;
    accent?: string;
    language?: string;
    tts?: boolean;
    stt?: boolean;
  } | null;
  const code = (b?.code ?? "").trim();
  if (!code) return Response.json({ error: "Code required." }, { status: 400 });

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("desktop_device_codes")
    .select("status,user_id,expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!row || row.status !== "approved" || !row.user_id || new Date(row.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "Login not approved or code expired." }, { status: 410 });
  }
  const ownerId = row.user_id as string;
  if (!(await userIsPro(ownerId))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  // Single use.
  const { data: claimed } = await admin
    .from("desktop_device_codes")
    .update({ status: "consumed" })
    .eq("code", code)
    .eq("status", "approved")
    .select("code")
    .maybeSingle();
  if (!claimed) return Response.json({ error: "Code already used." }, { status: 410 });

  const userName = (b?.userName ?? "").trim().slice(0, 60);
  const aiName = (b?.aiName ?? "").trim().slice(0, 60) || "Jawad";
  const accent =
    typeof b?.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : "#e5484d";
  const language = LANGUAGES.includes(b?.language ?? "") ? (b?.language as string) : "Deutsch";

  if (userName) {
    await admin.from("profiles").update({ name: userName }).eq("id", ownerId);
  }

  const modelId = await defaultDbModelSlug();
  const model = await resolveBotModel(modelId);
  if (!model.ok) return Response.json({ error: "No usable model is configured. Contact support." }, { status: 500 });

  const { data: existing } = await admin.from("bots").select("id").eq("owner_id", ownerId);
  if ((existing ?? []).length >= MAX_BOTS_PER_USER) {
    return Response.json({ error: "Bot limit reached. Delete a Bot on the website first." }, { status: 400 });
  }

  let slug = normalizeSlug(aiName);
  if (!validSlug(slug)) slug = "companion";
  for (let i = 2; i <= 9; i++) {
    const { data: taken } = await admin.from("bots").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${normalizeSlug(aiName)}-${i}`;
    if (i === 9) return Response.json({ error: "Name already taken, please choose another." }, { status: 409 });
  }

  const { data: bot, error: botError } = await admin
    .from("bots")
    .insert({
      owner_id: ownerId,
      slug,
      name: aiName,
      description: "My desktop AI companion.",
      personality: `Friendly desktop companion. The user's name is ${userName || "friend"}.`,
      instructions: `The user's name is ${userName || "friend"}. Always reply in ${language} unless the user asks otherwise. Keep answers short and helpful unless asked for detail.`,
      model_id: modelId,
      memory_enabled: true,
      include_user_memory: false,
      tools: { web_search: true, mcp_server_ids: [] },
      theme: { accent },
      voice: { tts_enabled: b?.tts !== false, stt_enabled: b?.stt !== false },
    })
    .select("*")
    .single();
  if (botError || !bot) return Response.json({ error: "Could not create companion." }, { status: 500 });

  const raw = randomKey();
  const { error: keyError } = await admin.from("api_keys").insert({
    user_id: ownerId,
    name: `Human Bot Desktop: ${slug}`,
    key_hash: await sha256Hex(raw),
    prefix: raw.slice(0, 8),
    enabled: true,
  });
  if (keyError) {
    await admin.from("bots").delete().eq("id", bot.id);
    return Response.json({ error: "Could not create key." }, { status: 500 });
  }

  return Response.json({ bot: toBot(bot), apiKey: raw, language });
}

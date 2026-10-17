/**
 * Model router for the Text → Film tool (Admin/tools/text2code2viedo).
 *
 * One rule: use the cheapest model that is good enough, and only escalate a
 * tier when the check on the previous result fails.
 *
 *   small  → classification, status lines, titles
 *   medium → planning, image prompts, copy
 *   large  → the whole HTML film page (code)
 *
 * Every call is logged with its tier, model and token usage so the admin can
 * see which tier costs the most (see the token log in the tool page).
 *
 * SERVER ONLY — reads provider keys. Never import from a client component.
 */

import { resolveDbModel } from "@/lib/admin";
import { getGatewaySecret } from "@/lib/gateways";
import { logModelUsage } from "@/lib/usage";
import type { ChatMessageInput } from "@/lib/providers/types";

export type Tier = "small" | "medium" | "large";
export const TIER_ORDER: Tier[] = ["small", "medium", "large"];

export interface TierDef {
  /** Human label shown in the UI. */
  label: string;
  /** Max tokens for this tier (coding needs a lot more than a status line). */
  maxTokens: number;
  temperature: number;
  /**
   * Ordered model slugs. Index 0 is the cheapest that is good enough; the
   * rest are fallbacks within the same tier, tried in order on failure.
   * Verified live before being added (see the admin probe notes).
   */
  chain: string[];
}

export const TIERS: Record<Tier, TierDef> = {
  small: {
    label: "small",
    maxTokens: 200,
    temperature: 0,
    // NVIDIA NIM is free and answered the classifier in ~0.3s.
    chain: ["humi1.1-speed", "gpt-oss-20b", "xk-qwen-qwen3-5-flash-free"],
  },
  medium: {
    label: "medium",
    maxTokens: 1400,
    temperature: 0.4,
    // Free + fast + vision-capable, so it can also judge the image prompts.
    chain: ["xk-qwen-qwen3-8-max-free", "kira-3-5-flash"],
  },
  large: {
    label: "large",
    maxTokens: 20000,
    temperature: 0.3,
    // Free coder first; escalate to the strongest coders only if the page
    // fails the syntax/structure check.
    chain: ["xk-qwen-qwen3-coder-plus-free", "cc-claude-sonnet-5", "cc-claude-opus-5-5"],
  },
};

export interface FilmUsage {
  tier: Tier;
  slug: string;
  provider: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ms: number;
  /** True when the provider did not return usage and we estimated chars/4. */
  estimated: boolean;
}

export interface CallResult {
  tier: Tier;
  slug: string;
  provider: string;
  providerModelId: string;
  text: string;
  usage: FilmUsage;
  /** The model this result was escalated from, if the first choice failed. */
  escalatedFrom?: string;
}

export interface CallContext {
  userId?: string | null;
  signal?: AbortSignal;
  /** Called for every model actually tried (before the result is checked). */
  onAttempt?: (info: { tier: Tier; slug: string; provider: string; reason?: string }) => void | Promise<void>;
  /** Called after a call resolves, with its usage block. */
  onUsage?: (usage: FilmUsage) => void | Promise<void>;
}

function baseUrl(v: string | undefined, fallback: string): string {
  return (v ?? fallback).replace(/\/$/, "");
}

/** Resolve the OpenAI-compatible endpoint + key for a provider (server-only). */
async function endpointFor(provider: string): Promise<{ base: string; key: string } | null> {
  if (provider === "nvidia") {
    const key = process.env.NVIDIA_API_KEY;
    return key ? { base: baseUrl(process.env.NVIDIA_BASE_URL, "https://integrate.api.nvidia.com/v1"), key } : null;
  }
  if (provider === "groq") {
    const key = process.env.GROQ_API_KEY;
    return key ? { base: baseUrl(process.env.GROQ_BASE_URL, "https://api.groq.com/openai/v1"), key } : null;
  }
  if (provider === "ifm") {
    const key = process.env.IFM_API_KEY;
    return key ? { base: baseUrl(process.env.IFM_BASE_URL, "https://api.ifm.ai/v1"), key } : null;
  }
  if (provider === "agnes") return null; // image pipeline, not chat
  const gw = await getGatewaySecret(provider);
  return gw ? { base: gw.base_url, key: gw.api_key } : null;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

interface RawCall {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
}

/** One OpenAI-compatible chat call that also captures the real token usage. */
async function rawChat(
  endpoint: { base: string; key: string },
  providerModelId: string,
  messages: ChatMessageInput[],
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal
): Promise<RawCall> {
  const timeout = AbortSignal.timeout(180_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${endpoint.base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: providerModelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal: combined,
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`${providerModelId} failed (HTTP ${res.status}): ${bodyText.slice(0, 240)}`);
  }
  let j: {
    choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null = null;
  try {
    j = JSON.parse(bodyText);
  } catch {
    throw new Error(`${providerModelId} returned a non-JSON body.`);
  }
  const text = String(j?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) {
    const sawReasoning = !!(j?.choices?.[0]?.message?.reasoning_content ?? "");
    throw new Error(
      sawReasoning
        ? `${providerModelId} used its whole budget on reasoning and returned no content.`
        : `${providerModelId} returned no content.`
    );
  }
  const u = j?.usage;
  if (u && typeof u.total_tokens === "number") {
    return {
      text,
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
      estimated: false,
    };
  }
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
  return {
    text,
    promptTokens: estimateTokens("x".repeat(promptChars)),
    completionTokens: estimateTokens(text),
    totalTokens: estimateTokens("x".repeat(promptChars)) + estimateTokens(text),
    estimated: true,
  };
}

/** Call one specific model slug at a given tier. */
export async function callModel(
  tier: Tier,
  slug: string,
  messages: ChatMessageInput[],
  ctx: CallContext = {}
): Promise<CallResult> {
  const db = await resolveDbModel(slug);
  if (!db) throw new Error(`Unknown model: ${slug}`);
  if (db.provider === "agnes") throw new Error("Image models cannot write text.");
  const endpoint = await endpointFor(db.provider);
  if (!endpoint) throw new Error(`Provider "${db.provider}" has no key configured.`);
  const def = TIERS[tier];
  const t0 = Date.now();
  await ctx.onAttempt?.({ tier, slug, provider: db.provider });
  const raw = await rawChat(endpoint, db.providerModelId, messages, def.maxTokens, def.temperature, ctx.signal);
  const usage: FilmUsage = {
    tier,
    slug,
    provider: db.provider,
    label: def.label,
    promptTokens: raw.promptTokens,
    completionTokens: raw.completionTokens,
    totalTokens: raw.totalTokens,
    ms: Date.now() - t0,
    estimated: raw.estimated,
  };
  await logModelUsage({
    user_id: ctx.userId ?? null,
    model_slug: slug,
    gateway_key: db.provider,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    success: true,
    source: "admin",
  });
  await ctx.onUsage?.(usage);
  return { tier, slug, provider: db.provider, providerModelId: db.providerModelId, text: raw.text, usage };
}

export interface EscalationResult {
  result: CallResult;
  /** True when the returned result passed the check. */
  valid: boolean;
  /** Models that were tried before the one returned. */
  tried: string[];
}

/**
 * Run the tier's chain (and every stronger tier after it) until a result passes
 * `validate`. Escalates only when the check fails — never on a hunch.
 */
export async function callWithEscalation(
  tier: Tier,
  messages: ChatMessageInput[],
  validate: ((text: string) => boolean) | null,
  ctx: CallContext = {}
): Promise<EscalationResult> {
  const tried: string[] = [];
  let last: CallResult | null = null;
  const startIdx = TIER_ORDER.indexOf(tier);
  for (let i = startIdx; i < TIER_ORDER.length; i++) {
    const t = TIER_ORDER[i];
    const chain = TIERS[t].chain;
    // Models in a stronger tier only get a shot once the weaker tier failed.
    const slugs = i === startIdx ? chain : chain;
    for (const slug of slugs) {
      try {
        const r = await callModel(t, slug, messages, ctx);
        if (last) r.escalatedFrom = last.slug;
        last = r;
        tried.push(slug);
        if (!validate || validate(r.text)) return { result: r, valid: true, tried };
      } catch (e) {
        tried.push(slug);
        await ctx.onAttempt?.({ tier: t, slug, provider: "?", reason: e instanceof Error ? e.message : "failed" });
      }
    }
  }
  if (!last) throw new Error(`All models in tier "${tier}" failed: ${tried.join(", ")}`);
  return { result: last, valid: false, tried };
}

/** Classify a request with the small tier. Returns one of the known labels. */
export async function classify(
  userMessage: string,
  ctx: CallContext = {}
): Promise<{ label: string; result: CallResult }> {
  const messages: ChatMessageInput[] = [
    {
      role: "system",
      content:
        "You are a strict intent classifier. Output EXACTLY one lowercase English word and nothing else, " +
        "chosen from: chat, plan, image, film, code. Do not translate, do not explain, do not continue the " +
        "sentence. A request to make a video, ad, film, clip, trailer or animation is: film.",
    },
    { role: "user", content: userMessage.slice(0, 600) },
  ];
  const KNOWN = new Set(["chat", "plan", "image", "film", "code"]);
  const { result } = await callWithEscalation("small", messages, (t) => KNOWN.has(t.trim().toLowerCase().split(/\s+/)[0]), ctx);
  const first = result.text.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "");
  return { label: KNOWN.has(first) ? first : "film", result };
}

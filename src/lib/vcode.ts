/**
 * humi.1.v-code — the website builder engine (server-only).
 * Primary code model: CodeCraft Cloud Ops 4.8 (CODECRAFT_API_KEY).
 * Fallback chain: xKiro free models → Groq free models.
 * Sandboxes: E2B (E2B_API_KEY, server-only). Static multi-file sites:
 * generate → write → serve → preview → iterate → download (.tar.gz).
 */

import { Sandbox } from "e2b";

export const VCODE_NAME = "humi.1.v-code";
const GROQ_URL = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
const XKIRO_URL = "https://api.xkiro.com/v1";
const CODECRAFT_URL = (process.env.CODECRAFT_BASE_URL ?? "https://codecraftapi.com").replace(/\/$/, "") + "/v1";
const PREVIEW_PORT = 3000;
/**
 * Optional custom preview domain (E2B custom-domain proxy, see E2B docs).
 * e.g. VCODE_PREVIEW_DOMAIN=preview.usehuman.de →
 * https://3000-<sandboxId>.preview.usehuman.de (wildcard DNS + Caddy proxy).
 * Unset = default https://3000-<sandboxId>.e2b.app URLs.
 */
const PREVIEW_DOMAIN = (process.env.VCODE_PREVIEW_DOMAIN ?? "").trim().replace(/\.$/, "");

export function previewUrlFor(sandboxId: string, e2bHost: string): string {
  if (PREVIEW_DOMAIN) return `https://${PREVIEW_PORT}-${sandboxId}.${PREVIEW_DOMAIN}`;
  return e2bHost.startsWith("http") ? e2bHost : `https://${e2bHost}`;
}

function groqKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured on the server.");
  return key;
}

function xkiroKey(): string | null {
  return process.env.XKIRO_API_KEY ?? null;
}

function codeCraftKey(): string | null {
  return process.env.CODECRAFT_API_KEY ?? null;
}

function e2bKey(): string {
  const key = process.env.E2B_API_KEY;
  if (!key) throw new Error("E2B_API_KEY is not configured on the server.");
  return key;
}

export interface VCodeFile {
  path: string;
  content: string;
}

function safePath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const clean = p.trim().replace(/^\/+/, "").slice(0, 120);
  if (!clean || clean.includes("..") || /[\\]/.test(clean)) return null;
  if (!/^[A-Za-z0-9._\-\/]+$/.test(clean)) return null;
  return clean;
}

const SYSTEM = `You are humi.1.v-code, an expert front-end builder. Output ONLY valid JSON, no markdown fences, no explanation.
Shape: {"files":[{"path":"index.html","content":"..."},{"path":"styles.css","content":"..."},{"path":"app.js","content":"..."}]}
Rules:
- 2-3 files, real complete multi-file project. index.html MUST link styles.css and app.js.
- Single responsibility per file. RTL + Arabic support when the user writes Arabic.
- Modern, premium dark design, no lorem ipsum, real copy matching the request.
- No external build step, no npm, no frameworks — plain HTML/CSS/JS only.
- COMPACT: max 3 files (index.html, styles.css, app.js), total under 3500 characters. Lean CSS.`;

const GAME_SYSTEM = `You are humi.1.v-code, an expert browser game developer. Output ONLY valid JSON, no markdown fences, no explanation.
Shape: {"files":[{"path":"index.html","content":"..."},{"path":"styles.css","content":"..."},{"path":"game.js","content":"..."}]}
Rules:
- Build a fully playable browser game using Canvas or DOM. index.html MUST link styles.css and game.js.
- Implement real game loop, collision detection, score, lives/game-over screen.
- Smooth 60fps animations using requestAnimationFrame. Keyboard + touch controls.
- Dark premium game UI with vibrant accent colors. Neon/arcade aesthetic when appropriate.
- No external libraries, no npm, no frameworks — plain HTML/CSS/JS with Canvas API only.
- Complete self-contained game, max 3 files, optimized code.`;

/** Free providers chained: xKiro coders first, Groq as backup. Each entry = separate quota pool. */
interface CodeBackend {
  url: string;
  key: () => string | null;
  model: string;
  maxTokens: number;
  extra?: Record<string, unknown>;
}

function backends(): CodeBackend[] {
  return [
    // Primary: CodeCraft Cloud Ops 4.8 — best coding model
    { url: CODECRAFT_URL, key: codeCraftKey, model: "cloud-ops-4.8", maxTokens: 8000 },
    // Fallback chain (free tiers)
    { url: XKIRO_URL, key: xkiroKey, model: "mistralai/codestral-2508", maxTokens: 4000 },
    { url: XKIRO_URL, key: xkiroKey, model: "qwen/qwen3-coder-plus:free", maxTokens: 4000 },
    { url: GROQ_URL, key: groqKey, model: "qwen/qwen3.8-27b", maxTokens: 950 },
    { url: GROQ_URL, key: groqKey, model: "openai/gpt-oss-120b", maxTokens: 3000, extra: { reasoning_effort: "low" } },
  ];
}

async function postCode(be: CodeBackend, msgs: { role: string; content: string }[]) {
  const key = be.key();
  if (!key) throw new Error("missing key");
  return fetch(`${be.url}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: be.model, messages: msgs, max_tokens: be.maxTokens, temperature: 0.4, ...(be.extra ?? {}) }),
    signal: AbortSignal.timeout(180_000),
  });
}

async function groqJson(messages: { role: string; content: string }[], short = false): Promise<VCodeFile[]> {
  const msgs = short
    ? [...messages, { role: "user", content: "Keep it VERY compact: total under 2000 characters. JSON only." }]
    : messages;
  const parsed = await backendJsonObject(msgs, short);
  return collectFiles(parsed as { files?: { path?: unknown; content?: unknown }[] });
}

/** Generic JSON call over the backend chain (object out, same retries). */
async function backendJsonObject(
  messages: { role: string; content: string }[],
  short = false
): Promise<Record<string, unknown>> {
  const msgs = short
    ? [...messages, { role: "user", content: "Shorter. JSON only." }]
    : messages;
  let lastErr = "";
  for (const be of backends()) {
    let res: Response;
    try {
      res = await postCode(be, msgs);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Network error.";
      continue;
    }
    if (!res.ok) {
      lastErr = `HTTP ${res.status}`;
      continue;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    let text = j.choices?.[0]?.message?.content ?? "";
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        lastErr = "unparseable output";
        continue;
      }
    }
    lastErr = "empty output";
  }
  if (!short) {
    await new Promise((r) => setTimeout(r, 65_000));
    return backendJsonObject(messages, true);
  }
  throw new Error(
    /429/.test(lastErr)
      ? "The free code models are busy right now (rate limit). Wait a minute and retry."
      : `Code model failed (${lastErr || "unknown error"}). Retry in a moment.`
  );
}

export interface PlanQuestion {
  id: string;
  label: string;
  type: "text" | "choice" | "color";
  placeholder?: string;
  options?: string[];
}

const PLANNER = `You are humi.1.v-code's planner. The user described a website. Reply ONLY valid JSON: {"reply":"...","questions":[{"id":"name","label":"...","type":"text|choice|color","placeholder":"...","options":["..."]}]}.
Rules: reply = one warm short sentence + what you'll ask (max 25 words). 1-3 questions max, most important first. Types: "text" for names/open input, "choice" for style/mood (2-4 options), "color" for palettes (3-4 hex options like "#e5484d"). Match the user's language.`;

const GAME_PLANNER = `You are humi.1.v-code's game planner. The user wants to build a browser game. Reply ONLY valid JSON: {"reply":"...","questions":[{"id":"...","label":"...","type":"text|choice|color","placeholder":"...","options":["..."]}]}.
Rules:
- reply = one exciting short sentence about the game (max 20 words). DO NOT mention websites or colors of shops.
- 2-3 questions about: game mechanics/difficulty, visual theme/mood, player controls or special features.
- Example questions: "Difficulty?", "Art style?", "Special power-ups?", "Speed?", "Theme?"
- Types: "choice" for game mechanics/themes (2-4 options), "text" for custom game name or feature.
- NEVER ask about bakery names, website colors, or business types. Focus ONLY on gameplay.
- Match the user's language (Arabic/German/English).`;

function parsePlannerResult(p: { reply?: unknown; questions?: unknown }, fallback: PlanQuestion[]): { reply: string; questions: PlanQuestion[] } {
  const reply = typeof p.reply === "string" && p.reply.trim() ? p.reply.trim().slice(0, 300) : "Got it — a few quick questions so I build exactly what you want.";
  const qs: PlanQuestion[] = [];
  if (Array.isArray(p.questions)) {
    for (const q of p.questions) {
      const o = q as Record<string, unknown>;
      const type = o.type === "choice" || o.type === "color" ? o.type : "text";
      const options = Array.isArray(o.options) ? o.options.filter((x) => typeof x === "string").slice(0, 4) as string[] : undefined;
      if (typeof o.label === "string" && o.label.trim() && typeof o.id === "string") {
        qs.push({
          id: o.id.slice(0, 24),
          label: o.label.slice(0, 80),
          type,
          placeholder: typeof o.placeholder === "string" ? o.placeholder.slice(0, 60) : undefined,
          options,
        });
      }
      if (qs.length >= 3) break;
    }
  }
  return { reply, questions: qs.length > 0 ? qs : fallback };
}

/** Discuss phase: short reply + structured follow-up questions. Falls back to defaults. */
export async function vcodePlan(prompt: string): Promise<{ reply: string; questions: PlanQuestion[] }> {
  const fallback: PlanQuestion[] = [
    { id: "name", label: "Site name?", type: "text", placeholder: "e.g. Layl Bakery" },
    { id: "colors", label: "Colors?", type: "color", options: ["#e5484d", "#f59e0b", "#10b981", "#3b82f6"] },
    { id: "style", label: "Style?", type: "choice", options: ["Dark premium", "Light clean", "Playful"] },
  ];
  try {
    const p = (await backendJsonObject([
      { role: "system", content: PLANNER },
      { role: "user", content: prompt.trim().slice(0, 1000) },
    ])) as { reply?: unknown; questions?: unknown };
    return parsePlannerResult(p, fallback);
  } catch {
    return { reply: "Got it — a few quick questions so I build exactly what you want.", questions: fallback };
  }
}

/** Game-specific discuss phase — asks about mechanics/theme, NOT website properties. */
export async function vcodePlanGame(prompt: string): Promise<{ reply: string; questions: PlanQuestion[] }> {
  const fallback: PlanQuestion[] = [
    { id: "difficulty", label: "Difficulty?", type: "choice", options: ["Easy & casual", "Medium", "Hard & fast"] },
    { id: "theme", label: "Visual theme?", type: "choice", options: ["Neon arcade", "Pixel retro", "Space sci-fi", "Minimal dark"] },
    { id: "feature", label: "Special feature?", type: "text", placeholder: "e.g. power-ups, multiplayer, leaderboard" },
  ];
  try {
    const p = (await backendJsonObject([
      { role: "system", content: GAME_PLANNER },
      { role: "user", content: prompt.trim().slice(0, 1000) },
    ])) as { reply?: unknown; questions?: unknown };
    return parsePlannerResult(p, fallback);
  } catch {
    return { reply: "Awesome idea! Let me ask a couple of quick questions to make your game epic.", questions: fallback };
  }
}

const HOST = `You are Humi, the friendly build companion of Human AI (not a generic assistant, never anyone else).
Chat naturally and briefly (1-3 sentences), in the user's language (Arabic/German/English).
You help the user figure out WHAT website they want. Ask one clarifying question at a time when needed.
NEVER claim to start building, never output code. If they describe something to build, warmly say you'll ask a few quick questions first.`;

/** Normal build-chat (identity, smalltalk follow-ups, clarifications). Plain text out. */
export async function vcodeChat(history: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const msgs = [
    { role: "system", content: HOST },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) })),
  ];
  let lastErr = "";
  for (const be of backends()) {
    try {
      const res = await postCode(be, msgs);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (j.choices?.[0]?.message?.content ?? "").trim().slice(0, 800);
      if (text) return text;
      lastErr = "empty output";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Network error.";
    }
  }
  throw new Error(
    /429/.test(lastErr)
      ? "The free code models are busy right now (rate limit). Wait a minute and retry."
      : "Chat failed. Retry in a moment."
  );
}

function collectFiles(parsed: { files?: { path?: unknown; content?: unknown }[] }): VCodeFile[] {
  const files: VCodeFile[] = [];
  for (const f of parsed.files ?? []) {
    const path = safePath(f.path);
    const content = typeof f.content === "string" ? f.content.slice(0, 60_000) : "";
    if (path && content) files.push({ path, content });
    if (files.length >= 8) break;
  }
  if (!files.some((f) => f.path === "index.html")) throw new Error("Code model returned no index.html.");
  return files;
}

/** Detect if a prompt is describing a game. */
export function isGamePrompt(prompt: string): boolean {
  return /(browser\s*game|game\s*(build|make|create)|\b(snake|chess|flappy|invader|breakout|tetris|puzzle\s+game|arcade|tower\s+defense|whack|memory\s+card|2048|platformer|rpg\s+game|space\s+game)\b)/i.test(prompt);
}

/** First generation from a plain user request. */
export async function vcodeGenerate(prompt: string, skill?: string | null, isGame?: boolean): Promise<VCodeFile[]> {
  const p = prompt.trim().slice(0, 2000);
  if (!p) throw new Error("A description is required.");
  const baseSystem = (isGame ?? isGamePrompt(p)) ? GAME_SYSTEM : SYSTEM;
  const sys = skill ? `${baseSystem}\n\nDESIGN SKILL (follow strictly):\n${skill}` : baseSystem;
  const userMsg = (isGame ?? isGamePrompt(p)) ? `Build this browser game:\n${p}` : `Build this website:\n${p}`;
  return groqJson([
    { role: "system", content: sys },
    { role: "user", content: userMsg },
  ]);
}

/** Iterate: full file set + user instruction → updated full file set. */
export async function vcodeIterate(files: VCodeFile[], instruction: string, skill?: string | null, isGame?: boolean): Promise<VCodeFile[]> {
  const dump = files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 20_000)}`)
    .join("\n")
    .slice(0, 40_000);
  const baseSystem = (isGame ?? isGamePrompt(instruction)) ? GAME_SYSTEM : SYSTEM;
  const sys = skill ? `${baseSystem}\n\nDESIGN SKILL (follow strictly):\n${skill}` : baseSystem;
  return groqJson([
    { role: "system", content: sys },
    {
      role: "user",
      content: `Current project files:\n${dump}\n\nChange request: ${instruction.trim().slice(0, 2000)}\nReturn the COMPLETE updated file set as JSON.`,
    },
  ]);
}

export function e2bConfigured(): boolean {
  return !!process.env.E2B_API_KEY;
}

/** Fresh sandbox for one build session (30 min, extended on activity). */
export async function vcodeSandbox(): Promise<Sandbox> {
  void e2bKey();
  return Sandbox.create({ timeoutMs: 30 * 60_000, allowInternetAccess: true });
}

export async function vcodeTouch(sandboxId: string): Promise<Sandbox> {
  const sbx = await Sandbox.connect(sandboxId);
  await sbx.setTimeout(30 * 60_000);
  return sbx;
}

/** Watermark badge: every built site links back to Human AI. Idempotent. */
const WATERMARK = `<a href="https://www.usehuman.de" target="_blank" rel="noopener" style="position:fixed;bottom:12px;right:12px;z-index:9999;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.72);color:#fff;font:600 12px/1 -apple-system,'Segoe UI',Arial,sans-serif;padding:7px 12px 7px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.18);text-decoration:none"><img src="https://www.usehuman.de/logo.webp" alt="" width="18" height="18" style="border-radius:6px;display:block">Built with Human AI</a>`;

export function withWatermark(html: string): string {
  if (html.includes("Built with Human AI")) return html;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx >= 0) return html.slice(0, idx) + WATERMARK + html.slice(idx);
  return html + WATERMARK;
}

/** Write one file (granular, for live activity). */
export async function vcodeWriteFile(sandboxId: string, file: VCodeFile): Promise<void> {
  const sbx = await vcodeTouch(sandboxId);
  const content = file.path === "index.html" ? withWatermark(file.content) : file.content;
  await sbx.files.write(`/home/user/site/${file.path}`, content);
}

/** (Re)start the static server. Returns the public URL. */
export async function vcodeServe(sandboxId: string): Promise<{ previewUrl: string }> {
  const sbx = await vcodeTouch(sandboxId);
  await sbx.commands.run("pkill -f 'http[.]server 3000' 2>/dev/null || true");
  await sbx.commands.run("cd /home/user/site && python3 -m http.server 3000", { background: true });
  await new Promise((r) => setTimeout(r, 2500));
  return { previewUrl: previewUrlFor(sandboxId, sbx.getHost(PREVIEW_PORT)) };
}

/** Write files + serve /home/user/site on PREVIEW_PORT. Returns the public URL. */
export async function vcodeDeployFiles(sandboxId: string, files: VCodeFile[]): Promise<{ previewUrl: string }> {
  for (const f of files) await vcodeWriteFile(sandboxId, f);
  return vcodeServe(sandboxId);
}

/** Pack the site as .tar.gz bytes (download). */
export async function vcodeArchive(sandboxId: string): Promise<Buffer> {
  const sbx = await vcodeTouch(sandboxId);
  const r = await sbx.commands.run("cd /home/user/site && tar -czf /tmp/site.tar.gz . && base64 -w0 /tmp/site.tar.gz");
  const b64 = (r.stdout ?? "").trim().replace(/\s+/g, "");
  if (b64.length < 100) throw new Error("Nothing to download yet.");
  return Buffer.from(b64, "base64");
}

/**
 * Prompts + plan parsing for the Text → Film tool.
 * Shared style for every image so the generated set looks consistent.
 */

export const BRAND = {
  accent: "#e5484d",
  accentHover: "#f2555a",
  ink: "#09090b",
  panel: "#0e0e11",
  text: "#ffffff",
  muted: "#a1a1aa",
};

export const SHARED_STYLE =
  "cinematic advertising still, dark charcoal background, Human AI red accent light (#e5484d), soft volumetric glow, " +
  "high contrast, clean minimal composition, shallow depth of field, 16:9, no text, no watermark, no logos";

export interface FilmScene {
  start: number;
  end: number;
  text: string;
  visual: string;
}

export interface FilmPlan {
  title: string;
  duration: number;
  palette: string[];
  scenes: FilmScene[];
  imagePrompts: string[];
}

export function planSystemPrompt(): string {
  return [
    "You are the planner for Human AI's text-to-film tool.",
    "Given a short request, design an ad film and return ONLY a JSON object (no markdown, no prose).",
    "Schema:",
    '{ "title": string (in the request language), "duration": number (seconds, default 30),',
    '  "palette": string[] (3-5 hex colors), ',
    '  "scenes": [{ "start": number, "end": number, "text": string, "visual": string }],',
    '  "imagePrompts": string[] (3-4 prompts) }',
    "Rules:",
    "- Use the request language for title, scene text. Keep brand names exactly as written (e.g. \"Human AI\").",
    `- Every image prompt MUST be in English and end with exactly this shared style: "${SHARED_STYLE}"`,
    "- Scenes must cover the whole duration with no gaps and no overlap.",
    "- Keep scene text short (max 8 words).",
    "- Return raw JSON only.",
  ].join("\n");
}

export function buildPlanUser(brief: string, duration: number): string {
  return `Request: ${brief}\nTarget duration: ${duration} seconds. Return the JSON now.`;
}

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Parse the planner output into a safe FilmPlan, with sensible fallbacks. */
export function parsePlan(text: string, brief: string, duration: number): FilmPlan {
  const fallback: FilmPlan = {
    title: brief.slice(0, 60),
    duration,
    palette: [BRAND.accent, BRAND.ink, BRAND.text, "#f5d0d1"],
    scenes: [
      { start: 0, end: duration * 0.35, text: brief.slice(0, 40), visual: "opening" },
      { start: duration * 0.35, end: duration * 0.75, text: "Human AI", visual: "product" },
      { start: duration * 0.75, end: duration, text: "Human AI", visual: "logo reveal" },
    ],
    imagePrompts: [
      `${brief} — establishing shot, ${SHARED_STYLE}`,
      `Human AI chat interface glowing on a dark screen, ${SHARED_STYLE}`,
      `abstract red light network, energy trails, ${SHARED_STYLE}`,
      `Human AI red logo glow on black, premium reveal, ${SHARED_STYLE}`,
    ],
  };
  let raw = stripFences(text);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return fallback;
  raw = raw.slice(first, last + 1);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const scenes: FilmScene[] = toArray(obj.scenes)
    .map((s) => {
      const o = s as Record<string, unknown>;
      return {
        start: Number(o.start) || 0,
        end: Number(o.end) || 0,
        text: String(o.text ?? "").slice(0, 120),
        visual: String(o.visual ?? "").slice(0, 200),
      };
    })
    .filter((s) => s.text || s.visual)
    .sort((a, b) => a.start - b.start);
  const dur = Number(obj.duration) > 0 ? Math.min(180, Number(obj.duration)) : duration;
  const imagePrompts = toArray(obj.imagePrompts)
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((p) => (new RegExp(SHARED_STYLE.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(p) ? p : `${p}, ${SHARED_STYLE}`));
  const palette = toArray(obj.palette).map((c) => String(c)).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 5);
  return {
    title: String(obj.title ?? fallback.title).slice(0, 80) || fallback.title,
    duration: dur,
    palette: palette.length >= 2 ? palette : fallback.palette,
    scenes: scenes.length >= 2 ? scenes : fallback.scenes,
    imagePrompts: imagePrompts.length >= 2 ? imagePrompts : fallback.imagePrompts,
  };
}

/** The film page is built by the large tier as ONE self-contained HTML file. */
export function filmSystemPrompt(): string {
  return [
    "You are the film engineer for Human AI. You build a LIVE film as ONE self-contained HTML page (no external video files).",
    "The user cannot render MP4s; the page plays in a preview iframe and can be screen-recorded.",
    "",
    "ARCHITECTURE (follow exactly):",
    "1. A fixed 1920x1080 stage scaled to fit the window, letterboxed on black.",
    "2. ONE clock. render(t) is a pure function of time t (0..duration) so pause, replay and the poster frame all work.",
    "3. A <canvas> layer for atmosphere: particles/network/light trails/glow with additive blending, pre-rendered glow sprites.",
    "4. A DOM layer for everything the viewer reads: logo, taglines, 3D-look cards, a product UI mock-up (chat typing letter by letter, image generation progress).",
    "5. Sound with the Web Audio API ONLY (no audio files): drone, pads, kick, hats, arpeggio, whooshes, a riser before the big reveal, a boom on the logo reveal, typing ticks, a soft final chord.",
    "6. Controls: Play, Pause, Replay, Sound on/off, Fullscreen, a progress bar, and keyboard shortcuts Space, M, R, F.",
    "7. Include a start overlay so audio begins on a user click (browsers block autoplay). Also listen for a message event: window.addEventListener('message', e => { if (e.data && e.data.type === 'humanai-play') start(); }).",
    "",
    "PERFORMANCE (a previous version crashed on a phone — do NOT repeat these):",
    "- NEVER use backdrop-filter, mix-blend-mode, will-change, large blur filters on moving layers, or box-shadow blur above 60px.",
    "- Set filter:none once an effect finishes.",
    "- Cap canvas width at 1920 and devicePixelRatio at 1.5.",
    "- Add adaptive quality: if smoothed frame time stays above ~38ms, drop canvas resolution in steps down to 50%.",
    "- No film grain overlay.",
    "",
    "CONTENT RULES:",
    "- Follow the provided plan scenes and timings exactly. Use only the brand colors given. No random text.",
    "- For Arabic: set direction:rtl, load the Cairo font from Google Fonts, NEVER use letter-spacing on Arabic, mirror the UI layout.",
    "- Spell every word exactly as provided.",
    "",
    "OUTPUT: return ONLY the complete HTML document (starts with <!doctype html> or <html>). No markdown fences, no commentary. Keep it under ~900 lines.",
  ].join("\n");
}

export function buildFilmUser(opts: {
  brief: string;
  plan: FilmPlan;
  images: { url: string; prompt: string }[];
  duration: number;
}): string {
  const imageList = opts.images
    .map((im, i) => `  ${i + 1}. ${im.url}  (${im.prompt.slice(0, 90)})`)
    .join("\n");
  return [
    `USER REQUEST: ${opts.brief}`,
    `DURATION: ${opts.duration} seconds.`,
    `BRAND COLORS: accent ${BRAND.accent}, hover ${BRAND.accentHover}, background ${BRAND.ink}, panel ${BRAND.panel}, text ${BRAND.text}, muted ${BRAND.muted}.`,
    `PALETTE: ${opts.plan.palette.join(", ")}.`,
    "",
    "PLAN (JSON):",
    JSON.stringify(opts.plan, null, 2),
    "",
    "GENERATED IMAGES (use these as scene backgrounds/cards where it fits; they are remote URLs and load fine in the iframe):",
    imageList || "  (none)",
    "",
    "Build the complete HTML film page now. Return ONLY the HTML.",
  ].join("\n");
}

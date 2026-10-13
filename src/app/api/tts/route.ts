import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHUNK = 180;
const MAX_CHUNKS = 22;

// Simple in-memory rate limit: 15 req/min per IP.
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now > cur.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  cur.count += 1;
  return cur.count > 15;
}

// Split on sentence/word boundaries so chunks stay natural in ar/de/en.
function chunkText(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?؟。!؟;；:])\s+/);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if ((cur + " " + s).trim().length <= max) {
      cur = (cur + " " + s).trim();
      continue;
    }
    if (cur) push();
    if (s.length <= max) {
      cur = s;
      continue;
    }
    for (const w of s.split(" ")) {
      if ((cur + " " + w).trim().length > max) push();
      cur = (cur + " " + w).trim();
    }
    push();
  }
  push();
  return out.filter(Boolean).slice(0, MAX_CHUNKS);
}

function isMp3(buf: Buffer): boolean {
  if (buf.length < 1000) return false;
  return (
    (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  );
}

/**
 * POST /api/tts — server text-to-speech for Humi spoken responses.
 * Body: { text: 1–4000 chars, language: "ar" | "de" | "en" }.
 * Verified provider chain: server-proxied language voice (no key required).
 * Returns audio/mpeg. Credentials never touch the browser (none needed).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many audio requests. Wait a moment." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as { text?: unknown; language?: unknown };
  const text = typeof b.text === "string" ? b.text : "";
  const language = b.language === "ar" || b.language === "de" || b.language === "en" ? b.language : null;
  if (!text.trim() || text.length > 4000 || !language) {
    return Response.json({ error: "Text (1–4000 chars) and language (ar/de/en) required." }, { status: 400 });
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return Response.json({ error: "Empty text after cleanup." }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const parts: Buffer[] = [];
    for (const chunk of chunks) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${language}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Referer: "https://translate.google.com/",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return Response.json({ error: `Speech generation failed (${res.status}).` }, { status: 502 });
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isMp3(buf)) {
        return Response.json({ error: "Speech provider returned no audio." }, { status: 502 });
      }
      parts.push(buf);
    }
    const mp3 = Buffer.concat(parts);
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(mp3.length),
        "X-TTS-Provider": "server-voice",
      },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return Response.json({ error: "Speech generation timed out." }, { status: 504 });
    }
    return Response.json({ error: "Speech generation failed." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

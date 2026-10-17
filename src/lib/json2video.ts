/**
 * Server-side JSON2Video client (template-style video rendering).
 * Key stays in JSON2VIDEO_API_KEY (server-only). Never import from client code.
 *
 * Docs: https://json2video.com/docs/v2/ — POST /v2/movies creates an async
 * project, GET /v2/movies?project= polls it. 1 credit per second of output.
 */

const BASE_URL = "https://api.json2video.com/v2";

function j2vKey(): string {
  const key = process.env.JSON2VIDEO_API_KEY;
  if (!key) throw new Error("JSON2VIDEO_API_KEY is not configured on the server.");
  return key;
}

function errLabel(status: number, errText: string, what: string): string {
  if (status === 403) return "JSON2Video rejected the server key. Check JSON2VIDEO_API_KEY.";
  if (status === 401)
    return "JSON2Video quota is empty (1 credit per second). Buy credits at json2video.com/dashboard/credits.";
  if (status === 413) return "Movie too complex. Shorten the prompt and retry.";
  return `${what} failed (HTTP ${status}): ${errText.slice(0, 300)}`.trim();
}

export interface J2vMovie {
  project: string;
  status: "pending" | "running" | "done" | "error" | "timeout" | string;
  url?: string | null;
  thumbnail?: string | null;
  message?: string;
  duration?: number;
}

/** Build a narrated caption movie from a plain prompt. */
export function j2vMovieJson(opts: { prompt: string; seconds: number }): Record<string, unknown> {
  const narration = opts.prompt.trim().slice(0, 600) || "Hello.";
  const caption = opts.prompt.trim().slice(0, 120) || "Hello.";
  return {
    resolution: "full-hd",
    scenes: [
      {
        elements: [
          { type: "voice", text: narration, duration: opts.seconds },
          {
            type: "text",
            text: caption,
            duration: opts.seconds,
            settings: {
              "font-family": "Montserrat",
              "font-size": "64px",
              "font-weight": "700",
              color: "#FFFFFF",
              "text-align": "center",
              "vertical-position": "center",
              "horizontal-position": "center",
            },
          },
        ],
      },
    ],
  };
}

/** Azure neural voices for the voice-only studio (voice element defaults to Azure). */
export const J2V_VOICES = [
  { id: "ar-SA-HamedNeural", label: "Arabic · Male", lang: "ar" },
  { id: "ar-SA-ZariyahNeural", label: "Arabic · Female", lang: "ar" },
  { id: "de-DE-ConradNeural", label: "German · Male", lang: "de" },
  { id: "de-DE-KatjaNeural", label: "German · Female", lang: "de" },
  { id: "en-US-GuyNeural", label: "English · Male", lang: "en" },
  { id: "en-US-JennyNeural", label: "English · Female", lang: "en" },
] as const;

export type J2vVoiceId = (typeof J2V_VOICES)[number]["id"];

export function isJ2vVoice(v: unknown): v is J2vVoiceId {
  return (J2V_VOICES as readonly { id: string }[]).some((x) => x.id === v);
}

/**
 * Build a voice-only movie: narration (optionally truncated to maxSeconds,
 * 1 credit/sec of audio) plus a minimal caption so the render always has
 * a visual track. The studio UI plays it back as audio-only.
 */
export function j2vVoiceMovieJson(opts: {
  text: string;
  voice: J2vVoiceId;
  maxSeconds?: number;
}): Record<string, unknown> {
  const narration = opts.text.trim().slice(0, 600) || "Hello.";
  const voiceEl: Record<string, unknown> = { type: "voice", text: narration, voice: opts.voice, model: "azure" };
  if (opts.maxSeconds && opts.maxSeconds > 0) voiceEl.duration = Math.min(opts.maxSeconds, 60);
  return {
    resolution: "full-hd",
    scenes: [
      {
        elements: [
          voiceEl,
          {
            type: "text",
            text: " ",
            duration: -2,
            settings: { color: "#000000", "background-color": "#000000" },
          },
        ],
      },
    ],
  };
}

/** Submit a voice-only render job. Returns the project id (poll with j2vGetMovie). */
export async function j2vCreateVoice(opts: {
  text: string;
  voice: J2vVoiceId;
  maxSeconds?: number;
}): Promise<{ project: string }> {
  const res = await fetch(`${BASE_URL}/movies`, {
    method: "POST",
    headers: { "x-api-key": j2vKey(), "Content-Type": "application/json" },
    body: JSON.stringify(j2vVoiceMovieJson(opts)),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res.status, t, "Voice task creation"));
  }
  const j = (await res.json()) as { project?: string; success?: boolean };
  if (!j.project) throw new Error("JSON2Video returned no project id.");
  return { project: j.project };
}

/** Submit a render job. Returns the project id (poll with j2vGetMovie). */
export async function j2vCreateMovie(opts: {
  prompt: string;
  seconds?: number;
}): Promise<{ project: string }> {
  const seconds = Math.min(Math.max(opts.seconds ?? 10, 4), 60);
  const res = await fetch(`${BASE_URL}/movies`, {
    method: "POST",
    headers: { "x-api-key": j2vKey(), "Content-Type": "application/json" },
    body: JSON.stringify(j2vMovieJson({ prompt: opts.prompt, seconds })),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res.status, t, "Video task creation"));
  }
  const j = (await res.json()) as { project?: string; success?: boolean };
  if (!j.project) throw new Error("JSON2Video returned no project id.");
  return { project: j.project };
}

/** Poll one project (format=simple: status only, cheap). */
export async function j2vGetMovie(project: string): Promise<J2vMovie> {
  const res = await fetch(`${BASE_URL}/movies?project=${encodeURIComponent(project)}&format=simple`, {
    headers: { "x-api-key": j2vKey() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(errLabel(res.status, t, "Video status check"));
  }
  const j = (await res.json()) as {
    success?: boolean;
    movie?: {
      status?: string;
      url?: string | null;
      thumbnail?: string | null;
      message?: string;
      duration?: number;
    };
  };
  const m = j.movie;
  if (!m) throw new Error("JSON2Video returned no movie.");
  return {
    project,
    status: m.status ?? "unknown",
    url: m.url ?? null,
    thumbnail: m.thumbnail ?? null,
    message: m.message,
    duration: m.duration,
  };
}

/** Poll a project until done/failed/timeout. Never rejects on timeout — returns pending state. */
export async function j2vWait(project: string, maxWaitMs?: number): Promise<J2vMovie> {
  const deadline = Date.now() + (maxWaitMs ?? 240_000);
  let cur: J2vMovie = { project, status: "pending" };
  for (;;) {
    cur = await j2vGetMovie(project).catch(() => cur);
    if (cur.status === "done" || cur.status === "error" || cur.status === "timeout") return cur;
    if (Date.now() >= deadline) return cur;
    // Docs: don't poll faster than every 5 seconds.
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Create + poll server-side until done/failed/timeout. Never rejects on timeout — returns pending state. */
export async function j2vCreateAndWait(opts: {
  prompt: string;
  seconds?: number;
  maxWaitMs?: number;
}): Promise<J2vMovie> {
  const { project } = await j2vCreateMovie(opts);
  return j2vWait(project, opts.maxWaitMs);
}

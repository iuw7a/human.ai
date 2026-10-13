"use client";

/**
 * Singleton server-TTS playback for Humi (MP3 via POST /api/tts).
 * No browser speechSynthesis — spoken responses always come from the
 * verified server voice. Stops previous audio before starting new audio.
 */

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopHumiAudio(): void {
  try {
    current?.pause();
  } catch {
    // ignore
  }
  current = null;
  if (currentUrl) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      // ignore
    }
    currentUrl = null;
  }
}

export type HumiAudioOutcome = "ok" | "failed" | "blocked";

export function playHumiTts(opts: {
  text: string;
  language: "ar" | "de" | "en";
  signal?: AbortSignal;
  onEnd?: () => void;
}): Promise<HumiAudioOutcome> {
  return (async () => {
    stopHumiAudio();
    const clean = opts.text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*`>|[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    if (!clean) return "failed" as const;
    let res: Response;
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, language: opts.language }),
        signal: opts.signal,
      });
    } catch {
      return "failed" as const;
    }
    if (!res.ok) return "failed" as const;
    const blob = await res.blob().catch(() => null);
    if (!blob || !blob.size) return "failed" as const;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    audio.onended = () => {
      if (current === audio) stopHumiAudio();
      opts.onEnd?.();
    };
    audio.onerror = () => {
      if (current === audio) stopHumiAudio();
      opts.onEnd?.();
    };
    try {
      await audio.play();
    } catch {
      if (current === audio) stopHumiAudio();
      return "blocked" as const;
    }
    return "ok" as const;
  })();
}

export function humiAudioPlaying(): boolean {
  return current != null && !current.paused && !current.ended;
}

/** Pick the server voice language: explicit setting wins, else detect from text. */
export function ttsLangFor(assistantLang: string, text: string): "ar" | "de" | "en" {
  if (assistantLang === "ar" || assistantLang === "de" || assistantLang === "en") return assistantLang;
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[äöüßÄÖÜ]/.test(text)) return "de";
  return "en";
}

/** Mic recognition locale for an assistant language. */
export function micLangFor(assistantLang: string): string {
  if (assistantLang === "ar") return "ar-SA";
  if (assistantLang === "de") return "de-DE";
  if (assistantLang === "en") return "en-US";
  if (typeof navigator !== "undefined") {
    const n = navigator.language ?? "";
    if (n.startsWith("ar")) return "ar-SA";
    if (n.startsWith("de")) return "de-DE";
  }
  return "en-US";
}

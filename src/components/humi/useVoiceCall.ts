"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  playHumiTts,
  stopHumiAudio,
  humiAudioPlaying,
  ttsLangFor,
  micLangFor,
} from "./humiAudio";

export type CallState =
  | "idle"
  | "requesting" // mic permission + session bootstrap
  | "connecting" // session ready, warming up
  | "listening" // mic open, Humi hears you
  | "processing" // thinking, no barge-in
  | "speaking" // TTS playing, barge-in armed
  | "error"
  | "ended";

export interface CallAssistant {
  id: string;
  name: string;
  model_id: string;
  personality: string;
  custom_instructions: string;
  language: string;
}

export interface CallExchange {
  chatId: string;
  userText: string;
  assistantText: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

type Rec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

function getRecognizer(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Rec) | null;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    getRecognizer() !== null &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß\u0600-\u06FF ]/gi, " ").replace(/\s+/g, " ").trim();
}

// Drop transcripts that are just Humi hearing its own voice (echo):
// if either normalized text contains the other, or word overlap is high.
function isEcho(transcript: string, spoken: string): boolean {
  const a = norm(transcript);
  const b = norm(spoken);
  if (!a || !b) return false;
  if (a.length < 4 || b.length < 4) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aw = new Set(a.split(" "));
  const bw = b.split(" ");
  let hit = 0;
  for (const w of bw) if (aw.has(w)) hit += 1;
  return hit / Math.max(1, bw.length) > 0.6;
}

const VAD_THRESHOLD = 0.03;
const VAD_FRAMES = 3;
const BARGE_IN_GRACE_MS = 900;

/**
 * Continuous voice-call loop for Humi.
 * Browser mic (SpeechRecognition + WebAudio level meter) -> /api/chat SSE
 * -> server TTS (/api/tts) playback. Barge-in cuts playback via mic energy.
 * No mocks: every state reflects a real operation; failures surface as messages.
 */
export function useVoiceCall(opts: {
  assistant: CallAssistant;
  initialHistory: Turn[];
  onExchange: (ex: CallExchange) => void;
  onEnded: () => void;
}) {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [captionUser, setCaptionUser] = useState("");
  const [captionAssistant, setCaptionAssistant] = useState("");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [ttsHint, setTtsHint] = useState<string | null>(null);

  const stateRef = useRef<CallState>("idle");
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const chatIdRef = useRef<string | null>(null);
  const historyRef = useRef<Turn[]>(opts.initialHistory);
  const recRef = useRef<Rec | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const loudFramesRef = useRef(0);
  const ttsStartedAtRef = useRef(0);
  const replyRef = useRef("");
  const aliveRef = useRef(true);
  const cbRef = useRef(opts.onExchange);
  cbRef.current = opts.onExchange;
  const endedCbRef = useRef(opts.onEnded);
  endedCbRef.current = opts.onEnded;
  const asstRef = useRef(opts.assistant);
  asstRef.current = opts.assistant;

  const go = useCallback((s: CallState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      go("error");
    },
    [go]
  );

  // ---- mic level meter (Web Audio, also feeds barge-in VAD) ----
  const micLevel = useCallback((): number => {
    const an = analyserRef.current;
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    try {
      an.getByteTimeDomainData(buf);
    } catch {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3);
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      // ignore
    }
    recRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getRecognizer();
    if (!Ctor || !aliveRef.current) return;
    stopRecognition();
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = micLangFor(asstRef.current.language);
    rec.onresult = (e: unknown) => {
      const ev = e as { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }> };
      let interim = "";
      let finalText = "";
      const from = typeof ev.resultIndex === "number" ? ev.resultIndex : 0;
      for (let i = from; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      if (interim) setCaptionUser(interim);
      if (finalText.trim()) void handleFinal(finalText);
    };
    rec.onerror = (e: unknown) => {
      const err = (e as { error?: string })?.error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        fail("Microphone blocked. Allow mic access in the browser, then start the call again.");
        return;
      }
      // 'no-speech' / 'aborted' / network blips: the loop restarts via onend.
    };
    rec.onend = () => {
      recRef.current = null;
      if (!aliveRef.current) return;
      const s = stateRef.current;
      // Keep the loop alive: re-arm while listening or speaking (barge-in needs it).
      if ((s === "listening" || s === "speaking") && !mutedRef.current) {
        try {
          startRecognition();
        } catch {
          // ignore — next tick retries via state
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinal(text: string) {
    const clean = text.trim();
    if (!clean || !aliveRef.current) return;
    const s = stateRef.current;
    if (s !== "listening" && s !== "speaking") return;
    // Barge-in: user talked over Humi — cut playback immediately.
    if (s === "speaking") {
      stopHumiAudio();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    }
    // Ignore Humi hearing itself (speaker echo).
    if (isEcho(clean, replyRef.current)) return;
    stopRecognition();
    setCaptionUser(clean);
    setCaptionAssistant("");
    replyRef.current = "";
    await runTurn(clean);
  }

  async function runTurn(userText: string) {
    const asst = asstRef.current;
    go("processing");
    setTtsHint(null);
    const history = [...historyRef.current, { role: "user", content: userText } as Turn];
    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;
    let full = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: asst.model_id,
          messages: history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
          assistantName: asst.name,
          personality: asst.personality,
          customInstructions: `${asst.custom_instructions}\nKeep spoken replies short (1-3 sentences). Plain text only: no markdown, no lists, no code blocks.`,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? `Request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as { token?: string; error?: string };
            if (json.error) throw new Error(json.error);
            if (json.token) {
              full += json.token;
              setCaptionAssistant(full);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // barged-in; a new turn already started
      setCaptionAssistant("");
      // Stay in the call: show the failure, go back to listening.
      setTtsHint(e instanceof Error ? e.message : "Something went wrong.");
      if (aliveRef.current && !mutedRef.current) {
        go("listening");
        startRecognition();
      } else if (aliveRef.current) {
        go("listening");
      }
      return;
    } finally {
      streamAbortRef.current = null;
    }
    if (!aliveRef.current) return;
    if (!full.trim()) {
      setTtsHint("Empty answer received. Speak again to retry.");
      go("listening");
      if (!mutedRef.current) startRecognition();
      return;
    }
    historyRef.current = [...history, { role: "assistant", content: full }];
    const chatId = chatIdRef.current;
    if (chatId) cbRef.current({ chatId, userText, assistantText: full });

    if (!speakerRef.current) {
      // Speaker off: captions only, brief beat, back to listening.
      go("speaking");
      setTimeout(() => {
        if (!aliveRef.current) return;
        setCaptionAssistant("");
        go("listening");
        if (!mutedRef.current) startRecognition();
      }, 900);
      return;
    }
    go("speaking");
    replyRef.current = full;
    ttsStartedAtRef.current = Date.now();
    const outcome = await playHumiTts({
      text: full,
      language: ttsLangFor(asst.language, full),
      onEnd: () => {
        if (!aliveRef.current) return;
        if (stateRef.current !== "speaking") return;
        replyRef.current = "";
        setCaptionAssistant("");
        go("listening");
        if (!mutedRef.current) startRecognition();
      },
    });
    if (outcome !== "ok") {
      replyRef.current = "";
      if (outcome === "blocked") {
        setTtsHint("Audio blocked by the browser — tap the page once. Captions continue.");
      } else {
        setTtsHint("Spoken response failed. Captions continue — speak to go on.");
      }
      if (aliveRef.current && stateRef.current === "speaking") {
        setCaptionAssistant("");
        go("listening");
        if (!mutedRef.current) startRecognition();
      }
    }
  }

  // ---- barge-in VAD tick ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    vadTimerRef.current = window.setInterval(() => {
      if (!aliveRef.current) return;
      if (stateRef.current !== "speaking" || mutedRef.current) {
        loudFramesRef.current = 0;
        return;
      }
      if (Date.now() - ttsStartedAtRef.current < BARGE_IN_GRACE_MS) return;
      if (!humiAudioPlaying()) {
        loudFramesRef.current = 0;
        return;
      }
      if (micLevel() > VAD_THRESHOLD) loudFramesRef.current += 1;
      else loudFramesRef.current = 0;
      if (loudFramesRef.current >= VAD_FRAMES) {
        loudFramesRef.current = 0;
        // Cut the audio now; the running recognition delivers the transcript.
        stopHumiAudio();
        streamAbortRef.current?.abort();
        streamAbortRef.current = null;
        replyRef.current = "";
        setCaptionAssistant("");
        go("listening");
      }
    }, 120);
    return () => {
      if (vadTimerRef.current !== null) window.clearInterval(vadTimerRef.current);
    };
  }, [micLevel]);

  const start = useCallback(async () => {
    if (!aliveRef.current) return;
    if (!supported()) {
      fail("Voice calls need a browser with microphone + speech recognition (Chrome or Edge).");
      return;
    }
    go("requesting");
    setError(null);
    setTtsHint(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Audio not supported in this browser.");
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (e) {
      const name = (e as Error)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        fail("Microphone blocked. Allow mic access in the browser, then start the call again.");
      } else {
        fail(e instanceof Error ? e.message : "Could not open the microphone.");
      }
      return;
    }
    go("connecting");
    try {
      const res = await fetch("/api/humi/voice-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: asstRef.current.id }),
      });
      const j = (await res.json().catch(() => null)) as { chat?: { id: string } } | null;
      if (!res.ok || !j?.chat) {
        throw new Error(
          (j as { error?: string } | null)?.error ?? "Could not start a voice session."
        );
      }
      chatIdRef.current = j.chat.id;
    } catch (e) {
      cleanupAudio();
      fail(e instanceof Error ? e.message : "Could not start a voice session.");
      return;
    }
    go("listening");
    startRecognition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupAudio = useCallback(() => {
    stopRecognition();
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micStreamRef.current = null;
    try {
      audioCtxRef.current?.close().catch(() => {});
    } catch {
      // ignore
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, [stopRecognition]);

  const end = useCallback(() => {
    aliveRef.current = false;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    stopHumiAudio();
    cleanupAudio();
    go("ended");
    endedCbRef.current();
  }, [cleanupAudio, go]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      stopRecognition();
    } else if (aliveRef.current && (stateRef.current === "listening" || stateRef.current === "speaking")) {
      startRecognition();
    }
  }, [startRecognition, stopRecognition]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerRef.current;
    speakerRef.current = next;
    setSpeakerOn(next);
    if (!next) stopHumiAudio();
  }, []);

  useEffect(
    () => () => {
      aliveRef.current = false;
      streamAbortRef.current?.abort();
      stopHumiAudio();
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      try {
        audioCtxRef.current?.close().catch(() => {});
      } catch {
        // ignore
      }
      if (vadTimerRef.current !== null) {
        try {
          window.clearInterval(vadTimerRef.current);
        } catch {
          // ignore
        }
      }
    },
    []
  );

  return {
    state,
    error,
    captionUser,
    captionAssistant,
    muted,
    speakerOn,
    ttsHint,
    micSupported: supported(),
    micLevel,
    start,
    end,
    toggleMute,
    toggleSpeaker,
  };
}

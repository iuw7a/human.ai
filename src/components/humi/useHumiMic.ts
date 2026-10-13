"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/** Voice INPUT for Humi (browser SpeechRecognition). Output stays server audio. */
export function useHumiMic(opts: { onTranscript: (text: string) => void; lang: string }) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => getRecognizer() !== null);
  const recRef = useRef<Rec | null>(null);
  const cbRef = useRef(opts.onTranscript);
  cbRef.current = opts.onTranscript;
  const langRef = useRef(opts.lang);
  langRef.current = opts.lang;

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognizer();
    if (!Ctor) return;
    try {
      recRef.current?.abort();
    } catch {
      // ignore
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = langRef.current;
    rec.onresult = (e: unknown) => {
      const ev = e as { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }> };
      let finalText = "";
      const from = typeof ev.resultIndex === "number" ? ev.resultIndex : 0;
      for (let i = from; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0]?.transcript ?? "";
      }
      if (finalText.trim()) cbRef.current(finalText);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
    },
    []
  );

  return { listening, supported, start, stop };
}

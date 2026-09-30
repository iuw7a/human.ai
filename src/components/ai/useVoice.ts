"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognizer(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Real browser voice: SpeechRecognition dictation + speechSynthesis readout.
 * listening/speaking states drive the Dynamic Island and avatar.
 */
export function useVoice(opts?: { onTranscript?: (text: string) => void; lang?: string }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sttSupported] = useState(() => getRecognizer() !== null);
  const [ttsSupported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window
  );
  const recRef = useRef<Rec | null>(null);
  const onTranscriptRef = useRef(opts?.onTranscript);
  onTranscriptRef.current = opts?.onTranscript;
  const lang = opts?.lang ?? "en-US";

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const startListening = useCallback(() => {
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
    rec.lang = lang;
    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0]?.transcript ?? "";
      }
      if (finalText.trim()) onTranscriptRef.current?.(finalText);
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
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported) return;
      try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const plain = text
          .replace(/```[\s\S]*?```/g, " code block omitted ")
          .replace(/[#*`>|[\]()]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200);
        if (!plain) return;
        const u = new SpeechSynthesisUtterance(plain);
        u.lang = lang;
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        synth.speak(u);
      } catch {
        setSpeaking(false);
      }
    },
    [ttsSupported, lang]
  );

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    },
    []
  );

  return { listening, speaking, sttSupported, ttsSupported, startListening, stopListening, speak, stopSpeaking };
}

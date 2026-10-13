"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useVoiceCall, type CallAssistant, type CallExchange } from "./useVoiceCall";

/**
 * Full-screen Humi voice-call overlay. Deep black, crimson accents,
 * live mic waveform, state-driven avatar glow. Responsive incl. landscape.
 */
export function CallInterface({
  assistant,
  avatarSrc,
  initialHistory,
  onExchange,
  onClose,
}: {
  assistant: CallAssistant;
  avatarSrc: string;
  initialHistory: { role: "user" | "assistant"; content: string }[];
  onExchange: (ex: CallExchange) => void;
  onClose: () => void;
}) {
  const call = useVoiceCall({ assistant, initialHistory, onExchange, onEnded: onClose });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef<number[]>([]);
  const startedRef = useRef(false);

  // Auto-start on mount (opened from an explicit user tap = gesture).
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void call.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc ends the call.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") call.end();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Waveform: mic energy while listening, animated pulse while speaking.
  useEffect(() => {
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 1;
      const cv = canvasRef.current;
      if (cv) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          const W = (cv.width = cv.clientWidth * 2);
          const H = (cv.height = 96);
          ctx.clearRect(0, 0, W, H);
          const lvl = call.state === "listening" || call.state === "requesting" ? call.micLevel() : 0;
          levelsRef.current.push(lvl);
          if (levelsRef.current.length > 48) levelsRef.current.shift();
          const speaking = call.state === "speaking";
          const n = 48;
          const bw = W / n;
          for (let i = 0; i < n; i++) {
            const hist = levelsRef.current[levelsRef.current.length - 1 - i] ?? 0;
            let h: number;
            if (speaking) {
              h = (0.25 + 0.55 * Math.abs(Math.sin(t / 7 + i / 3))) * H;
            } else {
              h = Math.max(4, hist * H * 1.6);
            }
            const x = W - (i + 1) * bw + bw * 0.2;
            ctx.fillStyle = speaking || call.state === "listening" ? "#e5484d" : "#3a3a42";
            const bh = Math.min(H, h);
            ctx.beginPath();
            ctx.roundRect(x, (H - bh) / 2, bw * 0.6, bh, bw * 0.3);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.state]);

  const statusText =
    call.state === "requesting" ? "Requesting microphone…"
    : call.state === "connecting" ? "Connecting…"
    : call.state === "listening" ? (call.muted ? "Muted — tap mic to resume" : "Listening…")
    : call.state === "processing" ? "Thinking…"
    : call.state === "speaking" ? "Speaking…"
    : call.state === "error" ? "Call failed"
    : "Ended";

  const glowing = call.state === "speaking" || call.state === "listening";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/95 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={`${assistant.name} voice call`}>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-5 py-8 landscape:max-w-4xl landscape:flex-row landscape:gap-10">
        {/* Avatar + state */}
        <div className="flex shrink-0 flex-col items-center text-center">
          <div
            className="relative"
            style={glowing ? { filter: "drop-shadow(0 0 28px rgba(229,72,77,0.45))" } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc}
              alt={assistant.name}
              className={`h-28 w-28 rounded-full border border-white/10 object-cover landscape:h-36 landscape:w-36 ${
                call.state === "speaking" ? "animate-pulse" : ""
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/humi.png";
              }}
            />
            <span
              className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-black ${
                call.state === "error" ? "bg-accent"
                : call.state === "listening" ? "bg-emerald-500"
                : call.state === "speaking" ? "animate-pulse bg-accent"
                : "bg-zinc-600"
              }`}
            />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-white">{assistant.name}</h2>
          <p className="mt-1 text-sm text-zinc-400" aria-live="polite">{statusText}</p>
        </div>

        {/* Waveform + captions + controls */}
        <div className="mt-6 w-full min-w-0 flex-1 landscape:mt-0">
          <canvas ref={canvasRef} className="h-12 w-full" aria-hidden="true" />
          <div className="mt-3 min-h-[76px] max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3" aria-live="polite">
            {call.captionUser && <p className="text-sm text-zinc-400">You: {call.captionUser}</p>}
            {call.captionAssistant && <p className="text-[15px] leading-6 text-zinc-100">{call.captionAssistant}</p>}
            {!call.captionUser && !call.captionAssistant && call.state !== "error" && (
              <p className="text-sm text-zinc-600">
                {call.state === "listening" ? "Speak naturally — interrupt anytime." : "…"}
              </p>
            )}
            {call.state === "error" && <p className="text-sm text-red-300">{call.error ?? "Call failed."}</p>}
            {call.ttsHint && <p className="text-xs text-zinc-500">{call.ttsHint}</p>}
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={call.toggleMute}
              aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
              title={call.muted ? "Unmute" : "Mute"}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                call.muted ? "bg-accent text-white" : "bg-white/[0.07] text-white hover:bg-white/[0.12]"
              }`}
            >
              {call.muted ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
            <button
              onClick={call.toggleSpeaker}
              aria-label={call.speakerOn ? "Speaker off" : "Speaker on"}
              title={call.speakerOn ? "Speaker on" : "Speaker off"}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                call.speakerOn ? "bg-white/[0.07] text-white hover:bg-white/[0.12]" : "bg-white/[0.04] text-zinc-500 hover:text-white"
              }`}
            >
              {call.speakerOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button
              onClick={call.end}
              aria-label="End call"
              title="End call"
              className="flex h-14 items-center gap-2 rounded-full bg-accent px-7 text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <PhoneOff size={19} /> End
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-zinc-600">Esc ends the call · everything is saved to this conversation</p>
        </div>
      </div>
    </div>
  );
}

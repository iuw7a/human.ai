"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, Download, Loader2 } from "lucide-react";
import { J2V_VOICES } from "@/lib/json2video";

const MAX_CHARS = 600;

/**
 * Admin voice studio: pick a natural Azure voice, type text, generate.
 * Rendered by JSON2Video as a voice-only movie (1 credit/sec) — the UI
 * plays it back as audio-only, the user never sees any video.
 */
export function VoiceTool() {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>(J2V_VOICES[0].id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  function stopPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPoll, []);

  async function pollOnce(project: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/tools/voice?project=${encodeURIComponent(project)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Status check failed.");
      setStatus(j.status ?? "");
      if (j.status === "completed" && j.url) {
        setAudioUrl(j.url);
        setBusy(false);
        stopPoll();
        return true;
      }
      if (j.status === "failed") throw new Error("Voice generation failed.");
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status check failed.");
      setBusy(false);
      stopPoll();
      return true;
    }
  }

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    stopPoll();
    setBusy(true);
    setError(null);
    setAudioUrl(null);
    setStatus("queued");
    try {
      const res = await fetch("/api/admin/tools/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t.slice(0, MAX_CHARS), voice }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Voice generation failed.");
      if (j.status === "completed" && j.url) {
        setAudioUrl(j.url);
        setStatus("completed");
        setBusy(false);
        return;
      }
      // Still rendering — keep polling client-side (docs: max every 5s).
      if (!j.project) throw new Error("Voice provider returned nothing usable.");
      setStatus(j.status ?? "in_progress");
      const project = j.project as string;
      pollRef.current = window.setInterval(() => void pollOnce(project), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice generation failed.");
      setBusy(false);
    }
  }

  const voiceLabel = J2V_VOICES.find((v) => v.id === voice)?.label ?? voice;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {audioUrl && (
        <div className="mb-5 rounded-[22px] border border-white/[0.08] bg-black p-5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          <p className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
            <AudioLines size={16} className="text-accent" />
            Generated voice ({voiceLabel}) — audio only
          </p>
          {/* MP4 behind an audio element: the user hears sound, never sees video. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={audioUrl} controls className="w-full" />
          <a
            href={audioUrl}
            download={`voice-${Date.now()}.mp4`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:border-accent/60 hover:text-white"
          >
            <Download size={14} /> Download audio
          </a>
        </div>
      )}
      {(busy || status === "in_progress") && !audioUrl && (
        <div className="mb-5 flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-black px-6 py-5">
          <AudioLines size={20} className="animate-pulse text-accent" />
          <p className="text-sm text-zinc-300">Rendering voice… {status}</p>
        </div>
      )}
      {error && (
        <p className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}
      <div className="rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={4}
          placeholder="Write the text to speak… (Ctrl+Enter to generate)"
          aria-label="Voice text"
          className="max-h-[240px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-2 px-1">
          <AudioLines size={16} className="text-zinc-500" />
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="rounded-xl border border-white/10 bg-transparent px-2 py-1.5 text-xs text-zinc-300 focus:outline-none"
            title="Voice"
          >
            {J2V_VOICES.map((v) => (
              <option key={v.id} value={v.id} className="bg-ink-900">
                {v.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-600">{text.trim().length}/{MAX_CHARS}</span>
          <div className="flex-1" />
          <button
            onClick={() => void submit()}
            disabled={busy || !text.trim()}
            className="btn-send !h-10 !w-10"
            aria-label="Generate voice"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        {busy ? "Rendering voice…" : "Natural Azure voices via JSON2Video · ~1 credit/sec · audio only, no video shown"}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Clapperboard, Loader2 } from "lucide-react";

/** Admin video studio: prompt bar + async task with live progress + player. */
export function VideoTool() {
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState("5");
  const [size, setSize] = useState("720P");
  const [ratio, setRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  function stopPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPoll, []);

  async function pollOnce(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/tools/videos?video_id=${encodeURIComponent(id)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Status check failed.");
      setStatus(j.status ?? "");
      setProgress(typeof j.progress === "number" ? j.progress : 0);
      if (j.status === "completed" && j.url) {
        setVideoUrl(j.url);
        setBusy(false);
        stopPoll();
        return true;
      }
      if (j.status === "failed") throw new Error("Video generation failed.");
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status check failed.");
      setBusy(false);
      stopPoll();
      return true;
    }
  }

  async function submit() {
    const p = prompt.trim();
    if (!p || busy) return;
    stopPoll();
    setBusy(true);
    setError(null);
    setVideoUrl(null);
    setVideoId(null);
    setProgress(0);
    setStatus("queued");
    try {
      const res = await fetch("/api/admin/tools/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, seconds, size, aspect_ratio: ratio }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Generation failed.");
      if (j.url) {
        setVideoUrl(j.url);
        setStatus("completed");
        setProgress(100);
        setBusy(false);
        return;
      }
      // Still rendering — keep polling client-side.
      setVideoId(j.video_id);
      setStatus(j.status ?? "in_progress");
      setProgress(j.progress ?? 0);
      const id = j.video_id as string;
      pollRef.current = window.setInterval(() => void pollOnce(id), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {(videoUrl || busy) && (
        <div className="mb-5 overflow-hidden rounded-[22px] border border-white/[0.08] bg-black shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
          {videoUrl ? (
            <video src={videoUrl} controls playsInline className="max-h-[60vh] w-full bg-black" />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-12">
              <Clapperboard size={28} className="animate-pulse text-accent" />
              <p className="text-sm text-zinc-300">
                Rendering… {status} {progress > 0 ? `${progress}%` : ""}
              </p>
              <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
              </div>
              {videoId && <p className="font-mono text-[11px] text-zinc-600">task {videoId}</p>}
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="mb-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}
      <div className="rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="Describe the video… subject, motion, camera, lighting (Enter to generate)"
          aria-label="Video prompt"
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
          <select value={seconds} onChange={(e) => setSeconds(e.target.value)} className="rounded-xl border border-white/10 bg-transparent px-2 py-1.5 text-xs text-zinc-300 focus:outline-none" title="Duration">
            {["4", "5", "6", "8", "12"].map((s) => (
              <option key={s} value={s} className="bg-ink-900">{s}s</option>
            ))}
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)} className="rounded-xl border border-white/10 bg-transparent px-2 py-1.5 text-xs text-zinc-300 focus:outline-none" title="Resolution">
            {["720P", "1080P", "1K", "2K"].map((s) => (
              <option key={s} value={s} className="bg-ink-900">{s}</option>
            ))}
          </select>
          <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="rounded-xl border border-white/10 bg-transparent px-2 py-1.5 text-xs text-zinc-300 focus:outline-none" title="Aspect ratio">
            {["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].map((s) => (
              <option key={s} value={s} className="bg-ink-900">{s}</option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            onClick={() => void submit()}
            disabled={busy || !prompt.trim()}
            className="btn-send !h-10 !w-10"
            aria-label="Generate video"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        {busy ? "Rendering with Agnes Video 2.5 (minutes possible)…" : "agnes-video-2.5 · async task API · key stays server-side"}
      </p>
    </div>
  );
}

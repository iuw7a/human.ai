"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, Coins, Download, Loader2, Send, Sparkles } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface Voice {
  id: string;
  label: string;
  lang: string;
}

const MAX_CHARS = 120;

/** Public Text2Voice studio: pick a voice, write, generate audio-only. */
export function Text2Voice({ user }: { user: SupabaseUser | null }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState("");
  const [text, setText] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outOfTokens, setOutOfTokens] = useState(false);
  const [amount, setAmount] = useState(10);
  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent" | "open">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  function stopPoll() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => stopPoll, []);

  useEffect(() => {
    if (!user) return;
    setLoadError(null);
    fetch("/api/voice")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? `Load failed (${r.status}).`);
        return j;
      })
      .then((j) => {
        if (j.voices?.length) {
          setVoices(j.voices);
          setVoice((v) => v || j.voices[0]?.id || "");
        }
        if (typeof j.balance === "number") {
          setBalance(j.balance);
          if (j.balance <= 0) setOutOfTokens(true);
        }
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "Could not load voices.");
      });
    fetch("/api/voice/request")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.open) setRequestState("open");
      })
      .catch(() => {});
  }, [user, loadTick]);

  async function pollOnce(project: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/voice?project=${encodeURIComponent(project)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Status check failed.");
      setStatus(j.status ?? "");
      if (typeof j.balance === "number") setBalance(j.balance);
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
    if (!t || busy || !voice) return;
    stopPoll();
    setBusy(true);
    setError(null);
    setOutOfTokens(false);
    setAudioUrl(null);
    setStatus("queued");
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t.slice(0, MAX_CHARS), voice }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 403 && j?.outOfTokens) {
        setOutOfTokens(true);
        setBalance(0);
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(j?.error ?? "Voice generation failed.");
      if (typeof j.balance === "number") {
        setBalance(j.balance);
        if (j.balance <= 0) setOutOfTokens(true);
      }
      if (j.status === "completed" && j.url) {
        setAudioUrl(j.url);
        setStatus("completed");
        setBusy(false);
        return;
      }
      if (!j.project) throw new Error("Voice provider returned nothing usable.");
      setStatus(j.status ?? "in_progress");
      const project = j.project as string;
      pollRef.current = window.setInterval(() => void pollOnce(project), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Voice generation failed.");
      setBusy(false);
    }
  }

  async function askAdmin() {
    setRequestState("sending");
    try {
      const res = await fetch("/api/voice/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error("Failed.");
      setRequestState("sent");
    } catch {
      setRequestState("idle");
      setError("Could not send the request. Try again.");
    }
  }

  if (!user) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-black px-4">
        <AudioLines size={44} className="text-accent" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">Text2Voice</h1>
        <p className="mt-2 max-w-sm text-center text-[15px] text-zinc-400">
          Turn text into natural voice. Log in to get your 10 free voices.
        </p>
        <div className="mt-6 flex gap-2">
          <a href="/login" className="btn-ghost text-[13px]">Log in</a>
          <a href="/signup" className="btn-primary !px-4 !py-2 text-[13px]">Sign up</a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-black">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-220px] h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/[0.13] blur-[130px]" />
        <div className="absolute bottom-[-260px] left-[8%] h-[420px] w-[480px] rounded-full bg-violet-600/[0.1] blur-[130px]" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-red-100">
            <AudioLines size={12} /> Text2Voice
          </span>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Give your words a voice
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-6 text-zinc-400">
            Pick a voice, write up to {MAX_CHARS} characters (~5 seconds), generate — audio only.
          </p>
          {balance !== null && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-200">
              <Coins size={13} className="text-accent" />
              {balance} voice token{balance === 1 ? "" : "s"} left
            </p>
          )}
        </div>

        {loadError && (
          <div className="mt-8 rounded-[22px] border border-amber-500/30 bg-amber-500/[0.06] p-5 text-center">
            <p className="text-sm font-semibold text-amber-200">Could not load voices</p>
            <p className="mt-1 text-[13px] text-zinc-400">{loadError}</p>
            <button
              onClick={() => setLoadTick((t) => t + 1)}
              className="btn-primary mt-3 !py-2 text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {voices.map((v) => {
            const selected = v.id === voice;
            return (
              <button
                key={v.id}
                onClick={() => setVoice(v.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  selected
                    ? "border-accent/60 bg-accent/10 shadow-[0_0_24px_rgba(229,72,77,0.15)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25"
                }`}
              >
                <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-zinc-200"}`}>
                  {v.label}
                </span>
                <span className="block text-[11px] uppercase tracking-wider text-zinc-500">{v.lang}</span>
              </button>
            );
          })}
        </div>

        {audioUrl && (
          <div className="mt-4 rounded-[22px] border border-white/[0.08] bg-[#0a0a0d]/95 p-5 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={audioUrl} controls className="w-full" />
            <a
              href={audioUrl}
              download={`text2voice-${Date.now()}.mp4`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition-colors hover:border-accent/60 hover:text-white"
            >
              <Download size={14} /> Download audio
            </a>
          </div>
        )}
        {(busy || status === "in_progress") && !audioUrl && (
          <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-[#0a0a0d]/95 px-6 py-5">
            {busy || status ? <Loader2 size={18} className="animate-spin text-accent" /> : null}
            <p className="text-sm text-zinc-300">Rendering voice… {status}</p>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
        )}

        {outOfTokens || balance === 0 ? (
          <div className="mt-4 rounded-[22px] border border-amber-500/30 bg-amber-500/[0.06] p-5 text-center">
            <p className="text-sm font-semibold text-amber-200">No voice tokens left</p>
            <p className="mt-1 text-[13px] text-zinc-400">Ask the admin for more tokens — requests land in the admin inbox.</p>
            {requestState === "open" || requestState === "sent" ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] font-medium text-emerald-200">
                <Send size={13} /> Request sent — the admin will review it
              </p>
            ) : (
              <div className="mt-3 flex items-center justify-center gap-2">
                <select
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                  title="Tokens to request"
                >
                  {[5, 10, 20].map((a) => (
                    <option key={a} value={a} className="bg-ink-900">{a} tokens</option>
                  ))}
                </select>
                <button
                  onClick={askAdmin}
                  disabled={requestState === "sending"}
                  className="btn-primary !py-2 text-sm"
                >
                  {requestState === "sending" ? <Loader2 size={15} className="animate-spin" /> : "Ask the admin for more tokens"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              rows={3}
              placeholder="Write it, hear it…"
              aria-label="Text to speak"
              className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <div className="mt-1 flex items-center gap-2 px-1">
              <span className="text-[11px] text-zinc-600">{text.trim().length}/{MAX_CHARS} · ~5s</span>
              <div className="flex-1" />
              <button
                onClick={submit}
                disabled={busy || !text.trim() || !voice}
                className="btn-send !h-10 !w-10"
                aria-label="Generate voice"
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>
      <footer className="relative z-10 flex items-center justify-center px-4 py-8">
        <a
          href="https://sham.ai.usehuman.de"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-accent/50 hover:text-white"
        >
          <Sparkles size={13} className="text-accent" />
          New: Sham AI
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
            Partner
          </span>
        </a>
      </footer>
    </div>
  );
}

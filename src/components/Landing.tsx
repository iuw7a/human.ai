"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PendingImage } from "@/components/ChatInput";
import { Composer } from "@/components/ai/Composer";
import { EmptyState } from "@/components/ai/EmptyState";
import { MascotAvatar } from "@/components/ai/MascotAvatar";
import { useVoice } from "@/components/ai/useVoice";
import type { ChatMode } from "@/components/ModeSelector";
import type { User as SupabaseUser } from "@supabase/supabase-js";

function newChatId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

function modeFromUrl(): ChatMode {
  try {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "agent" || m === "computer-use") return m;
  } catch {
    // ignore
  }
  return "chat";
}

function goalFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("goal") ?? "";
  } catch {
    return "";
  }
}

export default function LandingInner({ user }: { user: SupabaseUser | null }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [bgOk, setBgOk] = useState(false);
  // Entry-point mode (/?mode=agent, /?mode=computer-use). ONE chat is created on send.
  const [mode, setMode] = useState<ChatMode>("chat");
  const [initialGoal] = useState(() => goalFromUrl());
  const [voiceText, setVoiceText] = useState("");
  const voice = useVoice({ onTranscript: (t) => setVoiceText((prev) => (prev ? `${prev} ${t}` : t)) });

  useEffect(() => {
    setMode(modeFromUrl());
  }, []);

  function pickMode(m: ChatMode) {
    setMode(m);
    try {
      const url = m === "chat" ? "/" : `/?mode=${m}`;
      window.history.replaceState(null, "", url);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

  function handleSend(text: string, images: PendingImage[]) {
    if (!text.trim() && images.length === 0) return;
    const chatId = newChatId();
    try {
      sessionStorage.setItem(
        `humanai-pending-${chatId}`,
        JSON.stringify({ text, images, mode })
      );
    } catch {
      // storage unavailable — chat page will show empty state
    }
    setSending(true);
    router.push(`/chat/${chatId}`);
  }

  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/chat-bg.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="relative z-10 flex items-center justify-end px-4 py-2.5 sm:px-6">
        {!user && (
          <div className="flex items-center gap-2 pt-10 lg:pt-0">
            <a href="/login" className="btn-ghost text-[13px]">
              Log in
            </a>
            <a href="/signup" className="btn-primary !px-3 !py-1.5 text-[13px]">
              Sign up
            </a>
          </div>
        )}
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">
          <EmptyState
            avatar={<MascotAvatar status={voice.listening ? "listening" : "idle"} size={120} />}
            title="How can I help you?"
            subtitle="Ask anything, command your computer, or send an agent to browse for you."
          />
          <div className="mt-6">
            <Composer
              onSend={handleSend}
              sending={sending}
              mode={mode}
              onModeChange={pickMode}
              initialText={initialGoal}
              voiceText={voiceText}
              onVoiceTextConsumed={() => setVoiceText("")}
              voice={{
                listening: voice.listening,
                supported: voice.sttSupported,
                onMic: () => (voice.listening ? voice.stopListening() : voice.startListening()),
              }}
              placeholder={
                mode === "agent"
                  ? "Describe the task, e.g. Research this company…"
                  : mode === "computer-use"
                    ? "Describe what to do, e.g. Open ChatGPT…"
                    : "Ask Human AI anything..."
              }
            />
          </div>
        </div>
      </div>
      <footer className="relative z-10 flex items-center justify-center gap-4 px-4 py-4 text-xs text-zinc-500">
        <span>Human AI</span>
        <a href="/platform/about" className="hover:text-zinc-300">About</a>
        <a href="/terms" className="hover:text-zinc-300">Terms</a>
        <a href="/platform" className="hover:text-zinc-300">Platform</a>
      </footer>
    </div>
  );
}

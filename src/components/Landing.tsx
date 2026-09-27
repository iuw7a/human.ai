"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatInput, type PendingImage } from "@/components/ChatInput";
import type { User as SupabaseUser } from "@supabase/supabase-js";

function newChatId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

export default function LandingInner({ user }: { user: SupabaseUser | null }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [bgOk, setBgOk] = useState(false);

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
        JSON.stringify({ text, images })
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
      <div className="relative z-10 flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-2xl">
          <h1 className="mb-8 text-center text-5xl font-black tracking-[0.24em] text-white sm:text-7xl">
            HUMAN AI
          </h1>
          <ChatInput onSend={handleSend} sending={sending} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[
              "Explain this concept simply",
              "Help me debug my code",
              "What is in this image?",
            ].map((s) => (
              <button key={s} onClick={() => handleSend(s, [])} className="chip">
                {s}
              </button>
            ))}
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

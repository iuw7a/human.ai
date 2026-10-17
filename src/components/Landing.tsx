"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";
import { WordmarkFooter } from "@/components/site/WordmarkFooter";

export default function LandingInner() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const submittingRef = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholder, setPlaceholder] = useState("Ask Humi");
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [sending, setSending] = useState(false);

  const hasText = value.trim().length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || submittingRef.current) return;
    submittingRef.current = true;
    setSending(true);
    try {
      sessionStorage.setItem("humanai-goal", text);
    } catch {
      // ignore
    }
    setLeaving(true);
    setTimeout(() => {
      router.push(`/chat/new?goal=${encodeURIComponent(text)}`);
    }, 120);
  }, [value, router]);

  function autoGrow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  useEffect(() => {
    const ideas = ["Ask Humi", "Generate an image…", "Build a website…", "Explain anything…", "Write code…"];
    let i = 0;
    const tick = () => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        i = (i + 1) % ideas.length;
        setPlaceholder(ideas[i]);
        setPlaceholderVisible(true);
      }, 220);
    };
    const id = setInterval(tick, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden bg-black px-4 transition-all duration-300 ease-out ${
        leaving ? "opacity-0 -translate-y-6 scale-[0.97]" : "opacity-100 translate-y-0 scale-100"
      }`}
    >
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/land.bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-accent/[0.18] blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -right-28 h-[26rem] w-[26rem] rounded-full bg-accent/[0.16] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/4 right-1/3 h-56 w-56 rounded-full bg-accent/[0.14] blur-[80px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1/3 left-1/4 h-44 w-44 rounded-full bg-accent/[0.12] blur-[70px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.10] blur-[90px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(229,72,77,0.12), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(229,72,77,0.10), transparent 55%)",
        }}
      />

      <div className="relative flex flex-1 items-center justify-center pt-[18vh]">
        <div className="w-full max-w-xl animate-[fadeSlideUp_0.6s_cubic-bezier(0.22,1,0.36,1)_both]">
          <div className="mb-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.webp"
              alt="Human AI logo"
              className="mx-auto mb-4 h-14 w-14 object-cover"
            />
            <h1 className="text-[2rem] font-semibold tracking-tight text-white sm:text-[2.5rem]">
              Human AI
            </h1>
            <p className="mt-1.5 text-[15px] text-zinc-500">
              Ask anything. Generate images. Build things.
            </p>
          </div>

          <div className="rounded-[20px] bg-white/[0.04] px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-200 focus-within:bg-white/[0.06] focus-within:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]">
            {/* Send button row: textarea + round send button (like the sketch) */}
            <div className="group/landingbar flex items-end gap-3">
              <textarea
                ref={areaRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  autoGrow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={placeholder}
                autoFocus
                aria-label="Message Human AI"
                rows={1}
                className={`max-h-[160px] min-h-[28px] flex-1 resize-none bg-transparent text-[17px] leading-7 text-white placeholder:text-zinc-500 focus:outline-none transition-opacity duration-200 ${placeholderVisible ? "placeholder:opacity-100" : "placeholder:opacity-0"}`}
              />
              <button
                type="button"
                onClick={submit}
                disabled={!hasText || sending}
                aria-label="Send message"
                title="Send"
                className={[
                  "landing-send mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white",
                  "transition-all duration-300 ease-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  hasText && !sending
                    ? "scale-100 cursor-pointer bg-[#6b1519] opacity-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_6px_20px_rgba(107,21,25,0.55)] hover:scale-105 hover:bg-[#8a1c20] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_8px_28px_rgba(138,28,32,0.65)] active:scale-95"
                    : "scale-90 cursor-not-allowed bg-white/[0.07] text-zinc-500 opacity-60",
                  sending ? "animate-pulse" : "",
                ].join(" ")}
                style={
                  hasText && !sending
                    ? { animation: "landing-send-in 0.28s cubic-bezier(0.22,1,0.36,1) both" }
                    : undefined
                }
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ArrowUp
                    size={19}
                    strokeWidth={2.5}
                    className={`transition-transform duration-300 ${hasText ? "translate-y-0 opacity-100" : "-translate-y-0.5 opacity-70"}`}
                  />
                )}
              </button>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-zinc-600">
            Press Return to send.
          </p>
        </div>
      </div>

      <div className="relative z-10 w-full shrink-0">
        <WordmarkFooter showBorder={false} />
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Bot, Monitor, ChevronDown, Check } from "lucide-react";

export type ChatMode = "chat" | "agent" | "computer-use";

export const MODES: { id: ChatMode; label: string; hint: string; icon: typeof Bot }[] = [
  { id: "chat", label: "Chat", hint: "Normal Human AI chat", icon: MessageSquare },
  { id: "agent", label: "Agent", hint: "Browser agent", icon: Bot },
  { id: "computer-use", label: "Computer Use", hint: "Real computer control", icon: Monitor },
];

export function modeRoute(mode: ChatMode): string {
  if (mode === "agent") return "/agent";
  if (mode === "computer-use") return "/computer-use";
  return "/";
}

/**
 * Polished native mode selector for the chat bar.
 * Renders as [ Chat ▾ ] with a dropdown of Chat / Agent / Computer Use.
 * With onSelect, switching only changes the execution mode (same conversation).
 * Without onSelect (standalone entry points), it navigates to each mode's route.
 */
export function ModeSelector({
  value,
  getDraft,
  onSelect,
}: {
  value: ChatMode;
  getDraft?: () => string;
  onSelect?: (mode: ChatMode) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = MODES.find((m) => m.id === value) ?? MODES[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function select(mode: ChatMode) {
    setOpen(false);
    if (mode === value) return;
    if (onSelect) {
      onSelect(mode);
      return;
    }
    const draft = (getDraft?.() ?? "").trim();
    if (mode === "chat") {
      router.push("/");
      return;
    }
    router.push(draft ? `${modeRoute(mode)}?goal=${encodeURIComponent(draft)}` : modeRoute(mode));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-ink-600 hover:text-white"
      >
        <ActiveIcon size={13} className="text-accent" />
        {active.label}
        <ChevronDown size={13} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#141417] p-1.5 shadow-2xl shadow-black/60 animate-menu-in"
        >
          {MODES.map((m) => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                role="menuitem"
                onClick={() => select(m.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                  selected ? "bg-white/[0.07]" : "hover:bg-white/[0.07]"
                }`}
              >
                <m.icon size={15} className={selected ? "text-accent" : "text-zinc-500"} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-medium ${selected ? "text-white" : "text-zinc-200"}`}>
                    {m.label}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">{m.hint}</span>
                </span>
                {selected && <Check size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

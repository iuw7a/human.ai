"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ImagePlus, Loader2, Mic, MicOff, X } from "lucide-react";
import { ModeSelector, type ChatMode } from "../ModeSelector";
import type { PendingImage } from "../ChatInput";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_MB = 8;

function ToolButton({
  onClick,
  label,
  title,
  active,
  disabled,
  children,
}: {
  onClick?: () => void;
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-accent text-white shadow-[0_0_16px_rgba(229,72,77,0.5)]"
          : "text-zinc-400 hover:bg-white/[0.07] hover:text-white"
      } disabled:opacity-40`}
    >
      {children}
    </motion.button>
  );
}

/**
 * Large floating command composer. Same send contract as ChatInput
 * (text + images), restyled as a premium command bar.
 */
export function Composer({
  onSend,
  sending,
  placeholder = "Ask Human AI anything...",
  allowUpload = true,
  mode = "chat",
  onModeChange,
  initialText = "",
  voiceText,
  onVoiceTextConsumed,
  voice,
}: {
  onSend: (text: string, images: PendingImage[]) => void;
  sending: boolean;
  placeholder?: string;
  allowUpload?: boolean;
  mode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  initialText?: string;
  voiceText?: string;
  onVoiceTextConsumed?: () => void;
  voice?: {
    listening: boolean;
    supported: boolean;
    onMic: () => void;
  };
}) {
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Dictated text flows into the draft.
  useEffect(() => {
    if (voiceText) {
      setText((prev) => (prev ? `${prev} ${voiceText}` : voiceText));
      autoGrowSoon();
      onVoiceTextConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceText]);

  function autoGrow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }
  function autoGrowSoon() {
    requestAnimationFrame(() => autoGrow());
  }

  async function handleFiles(files: FileList | null) {
    setError(null);
    if (!allowUpload || !files) return;
    for (const file of Array.from(files).slice(0, 4 - images.length)) {
      if (!ACCEPTED.includes(file.type)) {
        setError("Only PNG, JPEG, WebP or GIF images are allowed.");
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`Image too large — max ${MAX_MB} MB per image.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setImages((prev) => [...prev, { dataUrl, mimeType: file.type, name: file.name }]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    const value = text.trim();
    if ((!value && images.length === 0) || sending) return;
    onSend(value, images);
    setText("");
    setImages([]);
    setError(null);
    if (areaRef.current) areaRef.current.style.height = "auto";
  }

  return (
    <div className="w-full">
      {error && (
        <p className="mb-2 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-[13px] text-red-200">
          {error}
        </p>
      )}
      <motion.div
        className="rounded-[28px] border bg-[#0e0e12]/90 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-4"
        animate={{
          borderColor: focused ? "rgba(229,72,77,0.45)" : "rgba(255,255,255,0.09)",
          boxShadow: focused
            ? "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(229,72,77,0.25), 0 0 32px rgba(229,72,77,0.12)"
            : "0 16px 48px rgba(0,0,0,0.55)",
        }}
        transition={{ duration: 0.22 }}
      >
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
            {images.map((img, i) => (
              <div key={i} className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-accent"
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={placeholder}
          aria-label="Message Human AI"
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-1 px-1">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {onModeChange && <ModeSelector value={mode} getDraft={() => text} onSelect={onModeChange} />}
          <ToolButton
            onClick={() => fileRef.current?.click()}
            label="Attach image"
            title={allowUpload ? "Attach image" : "Image uploads are disabled"}
            disabled={!allowUpload}
          >
            <ImagePlus size={18} />
          </ToolButton>
          {voice && (
            <ToolButton
              onClick={voice.onMic}
              label={voice.listening ? "Stop listening" : "Voice input"}
              title={voice.supported ? (voice.listening ? "Stop listening" : "Dictate") : "Voice input not supported in this browser"}
              active={voice.listening}
              disabled={!voice.supported}
            >
              {voice.listening ? <MicOff size={18} /> : <Mic size={18} />}
            </ToolButton>
          )}
          <div className="flex-1" />
          <motion.button
            onClick={submit}
            disabled={sending || (!text.trim() && images.length === 0)}
            whileTap={{ scale: 0.9 }}
            className="btn-send !h-10 !w-10"
            aria-label="Send message"
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </motion.button>
        </div>
      </motion.div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        Human AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}

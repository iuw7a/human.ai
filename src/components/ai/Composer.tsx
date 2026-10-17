"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Globe, ImagePlus, Loader2, Mic, MicOff, MoreHorizontal, Plus, Sparkles, X } from "lucide-react";
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
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
        active
          ? "bg-[#6b1519] text-white shadow-[0_0_16px_rgba(107,21,25,0.5)]"
          : "text-zinc-400 hover:bg-white/[0.07] hover:text-[#9a2228]"
      } disabled:opacity-40`}
    >
      {children}
    </motion.button>
  );
}

/**
 * Overflow menu (⋯) for secondary actions. Opens upward above the bar.
 * Future extras (e.g. Build and friends) go here — just add another item.
 */
function MoreMenu({ onNewChat }: { onNewChat?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative">
      <ToolButton
        onClick={() => setOpen((v) => !v)}
        label="More actions"
        title="More actions"
        active={open}
      >
        <MoreHorizontal size={18} />
      </ToolButton>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#141417] p-1.5 shadow-2xl shadow-black/60 animate-menu-in"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            More
          </p>
          {onNewChat && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNewChat();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.07]"
            >
              <Plus size={15} className="text-zinc-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-zinc-200">New chat</span>
                <span className="block truncate text-[11px] text-zinc-500">Start a fresh conversation</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Large floating command composer. Same send contract as ChatInput
 * (text + images), styled as a premium command pill.
 * `statusLine` is shown only when there is REAL live activity
 * (thinking / generating / listening / task status) — never placeholder text.
 */
export const Composer = memo(function Composer({
  onSend,
  sending,
  placeholder = "Ask Human AI anything...",
  allowUpload = true,
  onNewChat,
  initialText = "",
  voiceText,
  onVoiceTextConsumed,
  seedText,
  onSeedConsumed,
  onDraftChange,
  voice,
  statusLine,
  searchEnabled,
  onSearchChange,
}: {
  onSend: (text: string, images: PendingImage[]) => void;
  sending: boolean;
  placeholder?: string;
  allowUpload?: boolean;
  onNewChat?: () => void;
  initialText?: string;
  voiceText?: string;
  onVoiceTextConsumed?: () => void;
  /** A template prompt pushed in from the outside; replaces the draft and focuses it. */
  seedText?: string;
  onSeedConsumed?: () => void;
  /** The live draft, so the parent can see what is being typed (Auto model). */
  onDraftChange?: (text: string) => void;
  voice?: {
    listening: boolean;
    supported: boolean;
    onMic: () => void;
  };
  statusLine?: string;
  /** Web-search toggle. Rendered only when the parent wires it up. */
  searchEnabled?: boolean;
  onSearchChange?: (enabled: boolean) => void;
}) {
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Dictated text flows into the draft.
  useEffect(() => {
    if (voiceText) {
      const next = text ? `${text} ${voiceText}` : voiceText;
      setText(next);
      onDraftChange?.(next);
      autoGrowSoon();
      onVoiceTextConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceText]);

  // A picked template replaces the draft and puts the cursor in it, so the
  // prompt can be edited before sending.
  useEffect(() => {
    if (seedText) {
      setText(seedText);
      onDraftChange?.(seedText);
      autoGrowSoon();
      areaRef.current?.focus();
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedText]);

  function autoGrow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }
  function autoGrowSoon() {
    requestAnimationFrame(() => autoGrow());
  }

  async function handleFiles(files: FileList | File[] | null) {
    setError(null);
    if (!files) return;
    if (!allowUpload) {
      setError("Image uploads are disabled.");
      return;
    }
    const list = Array.from(files).slice(0, Math.max(0, 4 - images.length));
    if (list.length === 0) {
      setError("Max 4 images per message.");
      return;
    }
    for (const file of list) {
      if (!ACCEPTED.includes(file.type)) {
        setError("Only PNG, JPEG, WebP or GIF images are allowed.");
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`Image too large — max ${MAX_MB} MB per image.`);
        continue;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        setImages((prev) => [...prev, { dataUrl, mimeType: file.type, name: file.name }]);
      } catch {
        setError("Could not read that image. Try another file.");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Paste images straight from the clipboard (screenshots, copied files). */
  function handlePaste(e: React.ClipboardEvent) {
    const files: File[] = [];
    try {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }
      const rawFiles = e.clipboardData?.files;
      if (files.length === 0 && rawFiles && rawFiles.length > 0) {
        files.push(...Array.from(rawFiles));
      }
    } catch {
      // clipboard unreadable — ignore
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleFiles(files);
    }
  }

  function submit() {
    const value = text.trim();
    if ((!value && images.length === 0) || sending) return;
    onSend(value, images);
    setText("");
    onDraftChange?.("");
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
        className="relative rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-3.5"
        animate={{
          borderColor: dragOver
            ? "rgba(229,72,77,0.7)"
            : focused
              ? "rgba(229,72,77,0.45)"
              : "rgba(255,255,255,0.09)",
          boxShadow: focused
            ? "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(229,72,77,0.25), 0 0 32px rgba(229,72,77,0.12)"
            : "0 16px 48px rgba(0,0,0,0.6)",
        }}
        transition={{ duration: 0.22 }}
        onDragOver={(e) => {
          if (!allowUpload) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!allowUpload || !e.dataTransfer?.files?.length) return;
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[26px] bg-accent/10">
            <p className="rounded-full border border-accent/50 bg-black/70 px-4 py-2 text-sm font-medium text-white">
              Drop image to attach
            </p>
          </div>
        )}
        {statusLine && (
          <div className="flex items-center gap-2 px-2 pb-2 pt-0.5" aria-live="polite">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
            <p className="truncate text-xs text-zinc-400">{statusLine}</p>
          </div>
        )}
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
            onDraftChange?.(e.target.value);
            autoGrow();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
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
          {/* Locked on purpose: "Humi Auto" picks the model from the prompt —
              an image request switches to the image model by itself. */}
          <div
            className="inline-flex select-none items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-900/70 px-2.5 py-1.5 text-[12px] font-medium text-zinc-300"
            title="Humi Auto chooses the model. Ask for an image and it switches by itself."
            aria-label="Model: Humi Auto — chosen automatically"
          >
            <Sparkles size={12} className="text-accent" />
            Humi Auto
          </div>
          <div className="flex-1" />
          {onSearchChange && (
            <ToolButton
              onClick={() => onSearchChange(!(searchEnabled !== false))}
              label={searchEnabled !== false ? "Web search on" : "Web search off"}
              title={searchEnabled !== false ? "Web search is on — click to answer from knowledge only" : "Web search is off — click to allow live search"}
              active={searchEnabled !== false}
            >
              <Globe size={18} />
            </ToolButton>
          )}
          <ToolButton
            onClick={() => fileRef.current?.click()}
            label="Attach image"
            title={allowUpload ? "Attach image — or paste (Ctrl+V) / drop it here" : "Image uploads are disabled"}
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
          <MoreMenu onNewChat={onNewChat} />
          <motion.button
            onClick={submit}
            disabled={sending || (!text.trim() && images.length === 0)}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="btn-send !h-10 !w-10"
            aria-label="Send message"
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
})

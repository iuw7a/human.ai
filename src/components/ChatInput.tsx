"use client";

import { useRef, useState } from "react";
import { ArrowUp, ImagePlus, Loader2, X } from "lucide-react";

export interface PendingImage {
  dataUrl: string;
  mimeType: string;
  name: string;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_MB = 8;

export function ChatInput({
  onSend,
  sending,
  placeholder = "Ask Human AI anything...",
}: {
  onSend: (text: string, images: PendingImage[]) => void;
  sending: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  async function handleFiles(files: FileList | null) {
    setError(null);
    if (!files) return;
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
      setImages((prev) => [
        ...prev,
        { dataUrl, mimeType: file.type, name: file.name },
      ]);
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
        <p className="mb-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">
          {error}
        </p>
      )}
      <div className="rounded-[20px] border border-ink-600 bg-ink-900/95 p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-shadow focus-within:border-ink-600 focus-within:ring-1 focus-within:ring-accent/40">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative h-16 w-16 overflow-hidden rounded-xl border border-ink-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={`Upload ${i + 1}`}
                  className="h-full w-full object-cover"
                />
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={placeholder}
          className="max-h-[200px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between px-1">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-ink-800 hover:text-white"
            aria-label="Upload image"
            title="Upload image"
          >
            <ImagePlus size={18} />
          </button>
          <button
            onClick={submit}
            disabled={sending || (!text.trim() && images.length === 0)}
            className="btn-send"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={17} />
            )}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-500">
        Human AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}

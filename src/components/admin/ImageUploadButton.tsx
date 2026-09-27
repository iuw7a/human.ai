"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

export function ImageUploadButton({
  onUploaded,
  label = "Upload",
}: {
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Upload failed.");
      onUploaded(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost inline-flex items-center gap-1.5 border border-ink-700 !px-2.5 !py-1.5 text-xs"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {label}
        </button>
      </span>
      {error && <span className="text-[11px] text-red-300">{error}</span>}
    </span>
  );
}

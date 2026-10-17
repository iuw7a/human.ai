"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/admin/ui";

export function ModelDetailActions({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const { show, ToastEl } = useToast();

  async function put(url: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      show(res.ok ? "تم." : "فشل.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {ToastEl}
      <Link href={`/admin/models/free/${encodeURIComponent(slug)}/chat`} className="btn-primary text-xs">
        💬 Chat with him
      </Link>
      <button disabled={busy} onClick={() => put("/api/admin/models", { slug, enabled: !enabled })} className="btn-ghost border border-ink-700 text-xs">
        {enabled ? "Disable" : "Enable"}
      </button>
      <button disabled={busy} onClick={() => put("/api/admin/chat-defaults", { purpose: "chat", model_slug: slug })} className="btn-ghost border border-ink-700 text-xs">
        Set chat default
      </button>
      <button disabled={busy} onClick={() => put("/api/admin/chat-defaults", { purpose: "image", model_slug: slug })} className="btn-ghost border border-ink-700 text-xs">
        Set image default
      </button>
      <button disabled={busy} onClick={() => put("/api/admin/chat-defaults", { purpose: "code", model_slug: slug })} className="btn-ghost border border-ink-700 text-xs">
        Set code default
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface Announcement {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  link_url: string | null;
  kind: string;
}

export function AnnouncementBanner({ items }: { items: Announcement[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;
  return (
    <div className="border-b border-accent/30 bg-accent/10">
      {visible.map((a) => (
        <div key={a.id} className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-[13px] text-red-100">
            <b>{a.title}:</b> {a.message}{" "}
            {a.link_url && (
              <a href={a.link_url} className="underline underline-offset-2">Learn more</a>
            )}
          </p>
          <button
            onClick={() => setDismissed((d) => [...d, a.id])}
            className="shrink-0 rounded-md p-1 text-red-200/70 hover:text-white"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AnnouncementModal({ items }: { items: Announcement[] }) {
  const [open, setOpen] = useState(true);
  const current = items[0];
  if (!current || !open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
      <div className="card relative w-full max-w-md p-6 shadow-2xl animate-menu-in">
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <h2 className="text-lg font-semibold text-white">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{current.message}</p>
        {current.link_url && (
          <a href={current.link_url} className="btn-primary mt-4 text-xs">
            Learn more
          </a>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Copy the bot's public URL to the clipboard. */
export function ShareButton({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:text-white"
      title="Copy public link"
    >
      {done ? <Check size={13} className="text-emerald-400" /> : <Link2 size={13} />}
      {done ? "Copied" : "Share"}
    </button>
  );
}

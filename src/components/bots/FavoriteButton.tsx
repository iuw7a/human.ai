"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

/** Save/unsave heart. Real API state, no demo. */
export function FavoriteButton({ slug, initial }: { slug: string; initial: boolean }) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !fav;
    setFav(next);
    try {
      const res = await fetch(`/api/bots/${slug}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setFav(!next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={toggle}
      aria-label={fav ? "Remove from favorites" : "Save to favorites"}
      title={fav ? "Saved" : "Save"}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
        fav
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-white/10 bg-white/[0.03] text-zinc-500 hover:text-white"
      }`}
    >
      <Heart size={14} fill={fav ? "currentColor" : "none"} />
    </button>
  );
}

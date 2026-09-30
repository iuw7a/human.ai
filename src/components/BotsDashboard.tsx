"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MessageSquare, Settings2, Monitor, MoreHorizontal, Trash2, X } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "@/lib/bots";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function BotsDashboard() {
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuSlug, setMenuSlug] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/bots");
    const j = await res.json().catch(() => null);
    setBots(j?.bots ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(slug: string) {
    if (!confirm(`Delete "${slug}" and all its conversations and memories?`)) return;
    setMenuSlug(null);
    await fetch(`/api/bots/${slug}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">My Bots</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {bots.length === 0 ? "No companions yet." : `${bots.length} companion${bots.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button onClick={() => router.push("/bots/new")} className="btn-primary px-4 py-2.5 text-sm">
          <Plus size={16} /> Create Human Bot
        </button>
      </div>

      {loading && <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}

      {!loading && bots.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-lg font-semibold text-white">Create your first companion</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
            Give it a name, an avatar, a personality — then talk to it here or bring it
            onto your desktop as a floating companion.
          </p>
          <button onClick={() => router.push("/bots/new")} className="btn-primary mx-auto mt-5 px-6 py-2.5 text-sm">
            <Plus size={16} /> Create Human Bot
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {bots.map((b) => (
          <div key={b.id} className="card group relative p-5 transition-colors hover:border-ink-500">
            <div className="flex items-start gap-4">
              <button onClick={() => router.push(`/bot/${b.slug}`)} title={`Open ${b.name}`}>
                <BotAvatar src={b.avatar_url} name={b.name} size={64} accent={b.theme.accent} />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => router.push(`/bot/${b.slug}`)}
                  className="block max-w-full truncate text-left text-base font-semibold text-white hover:underline"
                >
                  {b.name}
                </button>
                <p className="truncate font-mono text-xs text-zinc-500">/bot/{b.slug}</p>
                {b.description && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-400">{b.description}</p>}
                <p className="mt-1.5 text-xs text-zinc-600">Active {timeAgo(b.last_active_at ?? b.updated_at)}</p>
              </div>
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuSlug(menuSlug === b.slug ? null : b.slug)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-ink-800 hover:text-white"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuSlug === b.slug && (
                  <>
                    <span className="fixed inset-0 z-10" onClick={() => setMenuSlug(null)} />
                    <span className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-ink-800 py-1 shadow-2xl">
                      <button
                        onClick={() => remove(b.slug)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-300 hover:bg-white/[0.06]"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button onClick={() => router.push(`/bot/${b.slug}/chat`)} className="btn-primary flex-1 !py-1.5 text-xs">
                <MessageSquare size={13} /> Open
              </button>
              <button onClick={() => router.push(`/bot/${b.slug}/customize`)} className="btn-ghost flex-1 border border-ink-600 !py-1.5 text-xs" title="Customize">
                <Settings2 size={13} /> Customize
              </button>
              <button onClick={() => router.push(`/bot/${b.slug}/desktop`)} className="btn-ghost flex-1 border border-ink-600 !py-1.5 text-xs" title="Desktop companion">
                <Monitor size={13} /> Desktop
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

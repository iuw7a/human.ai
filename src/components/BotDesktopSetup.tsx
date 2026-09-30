"use client";

import { useEffect, useState } from "react";
import { KeyRound, Download, Copy, Check, Trash2, Monitor, Square } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "@/lib/bots";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export function BotDesktopSetup({ bot }: { bot: Bot }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [raw, setRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(bot.companion.size);
  const [top, setTop] = useState(bot.companion.always_on_top);
  const [error, setError] = useState<string | null>(null);
  const base = typeof window !== "undefined" ? window.location.origin : "https://usehuman.de";

  async function loadKeys() {
    const res = await fetch(`/api/bots/${bot.slug}/key`);
    const j = await res.json().catch(() => null);
    setKeys(j?.keys ?? []);
  }

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.slug]);

  async function mint() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bots/${bot.slug}/key`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (!res.ok) setError(j?.error ?? "Could not create key.");
    else {
      setRaw(j.raw);
      loadKeys();
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    await fetch(`/api/bots/${bot.slug}/key?id=${id}`, { method: "DELETE" });
    loadKeys();
  }

  async function saveCompanion(patch: Record<string, unknown>) {
    const res = await fetch(`/api/bots/${bot.slug}/companion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setError("Could not save companion settings.");
  }

  async function resetPosition() {
    await saveCompanion({ x: null, y: null, size });
  }

  const scriptUrl = `/api/bots/${bot.slug}/companion-script?base=${encodeURIComponent(base)}`;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}

      <div className="card flex items-center gap-4 p-5">
        <BotAvatar src={bot.avatar_url} name={bot.name} size={56} accent={bot.theme.accent} />
        <div>
          <p className="font-semibold text-white">{bot.name} on your desktop</p>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            A floating companion using your Bot avatar. Drag it anywhere, click to chat — no website needed.
          </p>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">1</span>
          Create a Desktop key
        </h2>
        <p className="text-[13px] leading-6 text-zinc-400">
          The companion runs outside your browser, so it signs in with its own key (shown once — store it in the companion on first start).
        </p>
        {raw ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-300">Your key (only shown once)</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 font-mono text-xs text-emerald-100">{raw}</code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(raw);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
                className="btn-ghost shrink-0 border border-ink-600 px-3 py-2 text-xs"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={mint} disabled={busy} className="btn-primary px-5 py-2 text-xs">
            <KeyRound size={14} /> {busy ? "Creating…" : "Create Desktop key"}
          </button>
        )}
        {keys.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 rounded-xl bg-black/40 px-3 py-2 text-xs">
                <code className="font-mono text-zinc-300">{k.prefix}…</code>
                <span className="flex-1 truncate text-zinc-500">
                  {k.usage_count} uses{k.last_used_at ? ` · last ${new Date(k.last_used_at).toLocaleDateString()}` : ""}
                </span>
                <button onClick={() => revoke(k.id)} className="rounded-lg p-1.5 text-zinc-600 hover:bg-accent/15 hover:text-accent" title="Revoke key" aria-label="Revoke key">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">2</span>
          Download & start the companion
        </h2>
        <a href={scriptUrl} className="btn-primary inline-flex px-5 py-2 text-xs" download>
          <Download size={14} /> Download human-bot-{bot.slug}.ps1
        </a>
        <div className="rounded-xl bg-black/40 p-3">
          <p className="text-xs text-zinc-500">Run it (Windows PowerShell):</p>
          <code className="mt-1 block break-all font-mono text-xs leading-5 text-zinc-200">
            powershell -ExecutionPolicy Bypass -File human-bot-{bot.slug}.ps1
          </code>
        </div>
        <ul className="space-y-1 text-[13px] leading-6 text-zinc-400">
          <li>· Drag the avatar anywhere — position is remembered.</li>
          <li>· Drag the corner grip to resize, right-click for options.</li>
          <li>· Click the avatar to open the mini chat (text + voice when enabled).</li>
          <li>· Paste your Desktop key on first start.</li>
        </ul>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Monitor size={15} /> Companion appearance
        </h2>
        <div>
          <p className="label">Avatar size ({size}px)</p>
          <input
            type="range"
            min={48}
            max={160}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            onMouseUp={() => saveCompanion({ size })}
            onTouchEnd={() => saveCompanion({ size })}
            className="w-full accent-[#e5484d]"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={top}
            onChange={(e) => {
              setTop(e.target.checked);
              saveCompanion({ always_on_top: e.target.checked });
            }}
            className="accent-[#e5484d]"
          />
          Stay above other windows
        </label>
        <div className="flex gap-2">
          <button onClick={resetPosition} className="btn-ghost border border-ink-600 px-4 py-2 text-xs">
            <Square size={13} /> Reset position
          </button>
        </div>
      </div>
    </div>
  );
}

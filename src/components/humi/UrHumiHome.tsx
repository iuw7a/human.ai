"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Bot } from "lucide-react";

interface Assistant {
  id: string;
  name: string;
  avatar_url: string;
  personality: string;
  language: string;
  voice_enabled: boolean;
  model_id: string;
}

function Avatar({ a, size = 44 }: { a: Assistant; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = !broken && a.avatar_url ? a.avatar_url : "/humi.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={a.name}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="rounded-full border border-white/10 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** /urhumi interactivity: create, open, rename, delete your own Humis. */
export function UrHumiHome({ initial, signedIn }: { initial: Assistant[]; signedIn: boolean }) {
  const router = useRouter();
  const [assistants, setAssistants] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function reload() {
    const r = await fetch("/api/humi-assistants", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { assistants?: Assistant[] };
      setAssistants(j.assistants ?? []);
    }
  }

  async function create() {
    const n = name.trim() || "My Humi";
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/humi-assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const j = (await r.json().catch(() => null)) as { assistant?: Assistant; error?: string } | null;
      if (!r.ok || !j?.assistant) throw new Error(j?.error ?? "Creating failed.");
      setName("");
      router.push(`/urhumi/${j.assistant.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creating failed.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(a: Assistant) {
    const n = editName.trim().slice(0, 80);
    setEditingId(null);
    if (!n) return;
    setAssistants((list) => list.map((x) => (x.id === a.id ? { ...x, name: n } : x)));
    await fetch(`/api/humi-assistants/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    }).catch(() => {});
    void reload();
  }

  async function remove(a: Assistant) {
    if (!confirm(`Delete "${a.name}" with all its conversations?`)) return;
    setAssistants((list) => list.filter((x) => x.id !== a.id));
    await fetch(`/api/humi-assistants/${a.id}`, { method: "DELETE" }).catch(() => {});
    void reload();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
      <div className="card flex flex-col items-center p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/humi.png" alt="Humi" width={96} height={96} className="rounded-3xl border border-white/10 object-cover" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Meet Humi</h1>
        <p className="mt-1 text-[15px] text-zinc-400">Your personal AI assistant. Built around you.</p>
        <p className="mt-3 max-w-md text-[13px] leading-6 text-zinc-500">
          Every user gets their own Humi — private settings, conversations and memories,
          strictly separated from everyone else.
        </p>
        {!signedIn && (
          <Link href="/login?next=/urhumi" className="btn-primary mt-5">
            Log in to create your Humi
          </Link>
        )}
      </div>

      {signedIn && (
        <div className="card mt-4 p-5">
          <h2 className="text-sm font-semibold text-white">Create a personal Humi</h2>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              placeholder="Name, e.g. Alex"
              maxLength={80}
              className="input flex-1"
            />
            <button onClick={() => void create()} disabled={busy} className="btn-primary shrink-0">
              <Plus size={16} /> Create
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">{error}</p>
          )}
        </div>
      )}

      {signedIn && assistants.length === 0 && (
        <p className="mt-6 text-center text-sm text-zinc-500">No Humi yet — create your first one above.</p>
      )}

      <div className="mt-4 space-y-2">
        {assistants.map((a) => (
          <div key={a.id} className="card flex items-center gap-3 p-4">
            <Avatar a={a} />
            <div className="min-w-0 flex-1">
              {editingId === a.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename(a);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => void rename(a)}
                  maxLength={80}
                  className="input !py-1 text-sm"
                />
              ) : (
                <>
                  <p className="truncate text-[15px] font-medium text-white">{a.name}</p>
                  <p className="text-xs text-zinc-500">
                    {a.personality} · {a.language} · {a.voice_enabled ? "voice on" : "voice off"}
                  </p>
                </>
              )}
            </div>
            <Link href={`/urhumi/${a.id}`} className="btn-primary !px-4 !py-1.5 text-[13px]">
              Open
            </Link>
            <button
              onClick={() => { setEditName(a.name); setEditingId(a.id); }}
              className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.07] hover:text-zinc-200"
              aria-label="Rename"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => void remove(a)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-accent/15 hover:text-accent"
              aria-label="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {signedIn && assistants.length > 0 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-600">
          <Bot size={12} /> Only you can see and change your Humis.
        </p>
      )}
    </div>
  );
}

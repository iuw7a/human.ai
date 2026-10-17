"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, Plus, Power, Send, Trash2 } from "lucide-react";
import type { FilmLink, FilmLinkRequest } from "@/lib/film/store";

interface Data {
  links: FilmLink[];
  requests: FilmLinkRequest[];
}

export function GiveFilmAccessTool() {
  const [data, setData] = useState<Data>({ links: [], requests: [] });
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [maxFilms, setMaxFilms] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FilmLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tools/film-links");
    if (res.ok) {
      const j = (await res.json()) as Data;
      setData({ links: j.links ?? [], requests: j.requests ?? [] });
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/tools/film-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as (Data & { error?: string; created?: FilmLink }) | null;
        if (!res.ok) throw new Error(j?.error ?? "فشل الطلب.");
        setData({ links: j?.links ?? [], requests: j?.requests ?? [] });
        return j;
      } catch (e) {
        setError(e instanceof Error ? e.message : "فشل الطلب.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const create = useCallback(async () => {
    const n = name.trim();
    if (n.length < 2) {
      setError("اكتب اسماً من حرفين على الأقل.");
      return;
    }
    const j = await post({ action: "create", name: n, label: label.trim() || null, maxFilms: Number(maxFilms) || 3 });
    if (j?.created) {
      setCreated(j.created);
      setName("");
      setLabel("");
      setMaxFilms("3");
    }
  }, [name, label, maxFilms, post]);

  const linkFor = useCallback(
    (l: FilmLink) => `${origin}/access/from/theadmin/for/${l.slug}?k=${l.token}`,
    [origin]
  );

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      setError("تعذّر النسخ — انسخ الرابط يدوياً.");
    }
  }, []);

  const pending = data.requests.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-16">
      {error && <p className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>}

      {/* Create */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={16} className="text-accent" />
          <span className="text-sm font-semibold text-white">رابط جديد</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[160px] flex-1">
            <span className="mb-1 block text-[11px] text-zinc-500">الاسم (يظهر بآخر الرابط)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
              placeholder="Ahmed"
              className="w-full rounded-xl border border-white/10 bg-[#121216] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="min-w-[120px] flex-1">
            <span className="mb-1 block text-[11px] text-zinc-500">ملاحظة (اختياري)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="عميل / تجربة"
              className="w-full rounded-xl border border-white/10 bg-[#121216] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <label className="w-[110px]">
            <span className="mb-1 block text-[11px] text-zinc-500">عدد الفيديوهات</span>
            <input
              value={maxFilms}
              onChange={(e) => setMaxFilms(e.target.value)}
              type="number"
              min={0}
              className="w-full rounded-xl border border-white/10 bg-[#121216] px-3 py-2 text-sm text-zinc-100 focus:border-accent/50 focus:outline-none"
            />
          </label>
          <button
            onClick={() => void create()}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} أنشئ رابط
          </button>
        </div>

        {created && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
            <p className="mb-1.5 text-[11px] font-medium text-emerald-300">
              ✔ جاهز — ابعث هذا الرابط لـ {created.name}
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={linkFor(created)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] text-zinc-200"
              />
              <button
                onClick={() => void copy(linkFor(created), "new")}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
              >
                {copied === "new" ? <Check size={14} /> : <Copy size={14} />} {copied === "new" ? "تم" : "نسخ"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Requests */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Send size={15} className="text-amber-300" />
            <span className="text-sm font-semibold text-amber-100">طلبات تجديد ({pending.length})</span>
          </div>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-black/20 px-3 py-2">
                <span className="text-sm text-zinc-200">{r.link_name ?? r.link_slug ?? "رابط"}</span>
                <span className="text-[11px] text-zinc-500">{new Date(r.created_at).toLocaleString("ar")}</span>
                {r.message && <span className="text-[11px] text-zinc-400">— {r.message}</span>}
                <div className="flex-1" />
                <button
                  onClick={() => void post({ action: "handle-request", requestId: r.id, grant: 10 })}
                  disabled={busy}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  امنح +10 فيديو
                </button>
                <button
                  onClick={() => void post({ action: "handle-request", requestId: r.id, grant: 0 })}
                  disabled={busy}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                >
                  تم بدون زيادة
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900/40">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <span className="text-sm font-semibold text-zinc-200">الروابط ({data.links.length})</span>
        </div>
        {data.links.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-600">ما في روابط بعد — أنشئ أول واحد فوق.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {data.links.map((l) => {
              const remaining = Math.max(0, l.max_films - l.used_films);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{l.name}</span>
                      {l.label && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-400">{l.label}</span>}
                      {!l.enabled && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300">موقوف</span>}
                    </div>
                    <p className="truncate font-mono text-[11px] text-zinc-500">/access/from/theadmin/for/{l.slug}?k=…</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      استُخدم {l.used_films} · باقي <span className={remaining === 0 ? "text-amber-300" : "text-emerald-300"}>{remaining}</span> من {l.max_films}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => void copy(linkFor(l), l.id)}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-zinc-300 hover:text-white"
                      title="نسخ الرابط"
                    >
                      {copied === l.id ? <Check size={13} /> : <Link2 size={13} />} {copied === l.id ? "تم" : "نسخ"}
                    </button>
                    <button
                      onClick={() => void post({ action: "update", id: l.id, addFilms: 10 })}
                      disabled={busy}
                      className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                      title="أضف 10 فيديوهات"
                    >
                      <Plus size={13} /> 10
                    </button>
                    <button
                      onClick={() => void post({ action: "update", id: l.id, enabled: !l.enabled })}
                      disabled={busy}
                      className="flex h-8 items-center rounded-lg border border-white/10 px-2.5 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                      title={l.enabled ? "أوقف" : "شغّل"}
                    >
                      <Power size={13} className={l.enabled ? "text-emerald-400" : "text-red-400"} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`حذف رابط ${l.name}؟`)) void post({ action: "delete", id: l.id });
                      }}
                      disabled={busy}
                      className="flex h-8 items-center rounded-lg border border-white/10 px-2.5 text-xs text-zinc-400 hover:text-red-300 disabled:opacity-50"
                      title="حذف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-zinc-600">
        الرابط عام (بدون تسجيل دخول) — محمي بالاسم + الرمز السري. كل توليد للزائر يُخصم من حصة رابطه ويُحفظ بالمحفوظات باسمه.
      </p>
    </div>
  );
}

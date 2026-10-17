"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Clapperboard,
  Clock,
  Download,
  ExternalLink,
  Film,
  History,
  Loader2,
  Maximize2,
  Play,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";

interface UsageRow {
  step: string;
  tier: string;
  slug: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ms: number;
  estimated: boolean;
}

interface Plan {
  title: string;
  duration: number;
  palette: string[];
  scenes: { start: number; end: number; text: string; visual: string }[];
  imagePrompts: string[];
}

interface ImageSlot {
  index: number;
  url?: string;
  prompt?: string;
  error?: string;
}

interface HistoryItem {
  id: string;
  title: string;
  brief: string;
  duration: number;
  model: string | null;
  ok: boolean;
  images_count: number;
  scenes_count: number;
  total_tokens: number;
  source: string;
  author: string | null;
  created_at: string;
}

const EXAMPLES = [
  "سوّي إعلان 30 ثانية لـ Human AI بالعربي",
  "فيديو تعريفي 20 ثانية عن مساعد Human AI للإنتاجية",
  "إعلان سينمائي 15 ثانية لإطلاق ميزة توليد الصور",
];

export function Text2Code2VideoTool() {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [tasks, setTasks] = useState<{ text: string; done: boolean }[]>([]);
  const [images, setImages] = useState<ImageSlot[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [film, setFilm] = useState<{ title: string; html: string } | null>(null);
  const [usages, setUsages] = useState<UsageRow[]>([]);
  const [code, setCode] = useState<{ model: string; tier: string; ok: boolean; problems: string[]; bytes: number; escalated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [router, setRouter] = useState<Record<string, { chain: string[]; maxTokens: number }> | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [histBusy, setHistBusy] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const statusEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tools/film-history");
      if (res.ok) {
        const j = (await res.json()) as { projects?: HistoryItem[] };
        setHistory(j.projects ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/tools/text2code2viedo")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.tiers && setRouter(j.tiers))
      .catch(() => {});
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    statusEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [statuses, tasks, images]);

  const reset = () => {
    setStatuses([]);
    setTasks([]);
    setImages([]);
    setPlan(null);
    setFilm(null);
    setUsages([]);
    setCode(null);
    setError(null);
  };

  const submit = useCallback(async () => {
    const text = brief.trim();
    if (!text || busy) return;
    reset();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tools/text2code2viedo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `فشل الطلب (${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(data) as Record<string, unknown>;
          } catch {
            continue;
          }
          switch (ev.kind) {
            case "status":
              setStatuses((p) => [...p, String(ev.text)]);
              break;
            case "tasks":
              setTasks((ev.items as { text: string; done: boolean }[]) ?? []);
              break;
            case "plan":
              setPlan(ev.plan as Plan);
              break;
            case "image": {
              const idx = Number(ev.index);
              setImages((prev) => {
                const next = [...prev];
                next[idx] = { index: idx, url: String(ev.url), prompt: String(ev.prompt ?? "") };
                return next;
              });
              break;
            }
            case "image-error": {
              const idx = Number(ev.index);
              setImages((prev) => {
                const next = [...prev];
                next[idx] = { index: idx, error: String(ev.message ?? "فشل"), prompt: String(ev.prompt ?? "") };
                return next;
              });
              break;
            }
            case "usage":
              setUsages((p) => [
                ...p,
                {
                  step: String(ev.step),
                  tier: String(ev.tier),
                  slug: String(ev.slug),
                  provider: String(ev.provider),
                  promptTokens: Number(ev.promptTokens) || 0,
                  completionTokens: Number(ev.completionTokens) || 0,
                  totalTokens: Number(ev.totalTokens) || 0,
                  ms: Number(ev.ms) || 0,
                  estimated: !!ev.estimated,
                },
              ]);
              break;
            case "code":
              setCode({
                model: String(ev.model ?? ""),
                tier: String(ev.tier ?? ""),
                ok: !!ev.ok,
                problems: (ev.problems as string[]) ?? [],
                bytes: Number(ev.bytes) || 0,
                escalated: !!ev.escalated,
              });
              break;
            case "preview":
              setFilm({ title: String(ev.title ?? "Human AI film"), html: String(ev.html ?? "") });
              break;
            case "saved":
              void loadHistory();
              break;
            case "error":
              setError(String(ev.message ?? "خطأ."));
              break;
            default:
              break;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الطلب.");
    } finally {
      setBusy(false);
    }
  }, [brief, busy, loadHistory]);

  async function openHistory(id: string) {
    setHistBusy(id);
    try {
      const res = await fetch(`/api/admin/tools/film-history/${id}`);
      if (res.ok) {
        const j = (await res.json()) as { project?: { title: string; html: string } };
        if (j.project) setFilm({ title: j.project.title, html: j.project.html });
      }
    } finally {
      setHistBusy(null);
    }
  }

  async function removeHistory(id: string) {
    if (!confirm("حذف هذا الفيلم من المحفوظات؟")) return;
    await fetch(`/api/admin/tools/film-history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    void loadHistory();
  }

  function play() {
    iframeRef.current?.contentWindow?.postMessage({ type: "humanai-play" }, "*");
  }
  function fullscreen() {
    const el = iframeRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }
  function openTab() {
    if (!film) return;
    const url = URL.createObjectURL(new Blob([film.html], { type: "text/html" }));
    window.open(url, "_blank");
  }
  function download() {
    if (!film) return;
    const url = URL.createObjectURL(new Blob([film.html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${film.title.slice(0, 40) || "human-ai-film"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalTokens = usages.reduce((s, u) => s + u.totalTokens, 0);
  const doneTasks = tasks.filter((t) => t.done).length;

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      {router && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <Sparkles size={13} className="text-accent" />
          <span className="text-zinc-400">راوتر الموديلات:</span>
          {(["small", "medium", "large"] as const).map((t) => (
            <span key={t} className="rounded-full border border-ink-700 bg-ink-900 px-2 py-0.5 font-mono">
              {t}: {router[t]?.chain?.[0] ?? "—"}
            </span>
          ))}
        </div>
      )}

      {/* Prompt bar */}
      <div className="rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="اوصف الفيلم… مثال: إعلان 30 ثانية لـ Human AI بالعربي (Enter للتوليد)"
          aria-label="وصف الفيلم"
          className="max-h-[220px] w-full resize-none bg-transparent px-2 py-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
          <Film size={16} className="text-zinc-500" />
          <span className="text-[11px] text-zinc-600">فيلم حي = صفحة HTML واحدة (canvas + Web Audio)</span>
          <div className="flex-1" />
          <button
            onClick={() => void submit()}
            disabled={busy || !brief.trim()}
            className="btn-send !h-10 !w-10"
            aria-label="توليد الفيلم"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>

      {!busy && statuses.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setBrief(ex)}
              className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-accent/40 hover:text-zinc-200"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">{error}</p>
      )}

      {(statuses.length > 0 || tasks.length > 0) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {/* Live status + tasks */}
          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clapperboard size={15} className="text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">حالة الأيجنت المباشرة</span>
              {busy && <Loader2 size={13} className="animate-spin text-accent" />}
            </div>
            <ul className="mb-4 space-y-1.5">
              {tasks.map((t, i) => (
                <li key={i} className={`flex items-center gap-2 text-[13px] ${t.done ? "text-zinc-400" : "text-zinc-300"}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${t.done ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.06] text-zinc-600"}`}>
                    {t.done ? <Check size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />}
                  </span>
                  {t.text}
                </li>
              ))}
            </ul>
            <div className="max-h-52 space-y-1 overflow-y-auto border-t border-white/[0.06] pt-3">
              {statuses.map((s, i) => (
                <p key={i} className="text-[12.5px] leading-6 text-zinc-500">
                  <span className="text-accent/70">›</span> {s}
                </p>
              ))}
              <div ref={statusEndRef} />
            </div>
            {tasks.length > 0 && (
              <p className="mt-2 text-[11px] text-zinc-600">{doneTasks} / {tasks.length} خطوات مكتملة</p>
            )}
          </div>

          {/* Images */}
          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              الصور {images.filter((i) => i.url).length} من {Math.max(images.length, plan?.imagePrompts?.length ?? 0) || ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(images.length ? images : plan?.imagePrompts?.slice(0, 4).map((_, i) => ({ index: i } as ImageSlot)) ?? []).map((im, i) => (
                <div key={i} className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-black">
                  {im.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={im.url} alt={`صورة ${i + 1}`} className="h-full w-full object-cover" />
                  ) : im.error ? (
                    <span className="flex h-full items-center justify-center px-2 text-center text-[11px] text-red-300/80">{im.error}</span>
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <Loader2 size={16} className="animate-spin text-zinc-600" />
                    </span>
                  )}
                </div>
              ))}
              {images.length === 0 && !plan && <p className="col-span-2 text-xs text-zinc-600">تظهر الصور هنا أول ما تجهز.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {film && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-700 bg-black">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-ink-900/80 px-3 py-2">
            <Film size={15} className="text-accent" />
            <span className="text-sm font-medium text-white">{film.title}</span>
            {code && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${code.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {code.ok ? "الفحص نجح" : "قالب احتياطي"} · {code.model}
              </span>
            )}
            <div className="flex-1" />
            <button onClick={play} className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
              <Play size={13} /> تشغيل
            </button>
            <button onClick={fullscreen} className="flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white" title="ملء الشاشة">
              <Maximize2 size={13} /> <Volume2 size={13} />
            </button>
            <button onClick={openTab} className="flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white" title="فتح بتبويب جديد">
              <ExternalLink size={13} />
            </button>
            <button onClick={download} className="flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white" title="تنزيل HTML">
              <Download size={13} />
            </button>
          </div>
          <iframe
            ref={iframeRef}
            title={film.title}
            sandbox="allow-scripts allow-same-origin allow-presentation"
            srcDoc={film.html}
            className="h-[62vh] min-h-[420px] w-full bg-black"
          />
        </div>
      )}

      {/* Token log */}
      {usages.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-ink-700">
          <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900/80 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">سجل التوكنز لكل خطوة</span>
            <span className="font-mono text-[11px] text-zinc-500">الإجمالي {totalTokens.toLocaleString()} توكن</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-900/40 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">الخطوة</th>
                  <th className="px-3 py-2 font-medium">المستوى</th>
                  <th className="px-3 py-2 font-medium">الموديل</th>
                  <th className="px-3 py-2 font-mono font-medium">إدخال</th>
                  <th className="px-3 py-2 font-mono font-medium">إخراج</th>
                  <th className="px-3 py-2 font-mono font-medium">إجمالي</th>
                  <th className="px-3 py-2 font-mono font-medium">الزمن</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {usages.map((u, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    <td className="px-3 py-2">{u.step}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase">{u.tier}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{u.slug}</td>
                    <td className="px-3 py-2 font-mono">{u.promptTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono">{u.completionTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono">
                      {u.estimated ? "≈" : ""}
                      {u.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-500">{(u.ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-700 bg-ink-900/40 px-4 py-2 text-[11px] text-zinc-600">
            ≈ = المزوّد ما رجّع usage فحسبتها تقديراً (chars/4). المشروع ما فيه جدول أسعار لكل توكن — السجل يعرض التوكنز والزمن فقط.
          </p>
        </div>
      )}

      {/* History (محفوظات) */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <History size={16} className="text-accent" />
          <span className="text-sm font-semibold text-zinc-200">المحفوظات</span>
          <span className="text-[11px] text-zinc-600">{history.length} فيلم محفوظ</span>
          <div className="flex-1" />
          <button onClick={() => void loadHistory()} className="text-[11px] text-zinc-500 hover:text-zinc-300">
            تحديث
          </button>
        </div>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-900/40 px-4 py-6 text-center text-sm text-zinc-600">
            ما في أفلام محفوظة بعد — أول فيلم تولّده بينحفظ هنا.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {history.map((h) => (
              <div key={h.id} className="flex flex-col gap-2 rounded-2xl border border-ink-700 bg-ink-900/50 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{h.title || "بدون عنوان"}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-zinc-500">{h.brief}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      h.source === "sandbox" ? "bg-sky-500/15 text-sky-300" : "bg-white/[0.06] text-zinc-400"
                    }`}
                  >
                    {h.source === "sandbox" ? (h.author ? `زائر · ${h.author}` : "زائر") : "أدمن"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(h.created_at).toLocaleString("ar")}
                  </span>
                  <span>{h.scenes_count} مشاهد</span>
                  <span>{h.images_count} صور</span>
                  <span>{h.duration}ث</span>
                  <span>{h.total_tokens.toLocaleString()} توكن</span>
                  {!h.ok && <span className="text-amber-300">قالب احتياطي</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => void openHistory(h.id)}
                    disabled={histBusy === h.id}
                    className="flex items-center gap-1.5 rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent disabled:opacity-50"
                  >
                    {histBusy === h.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} افتح
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => void removeHistory(h.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-500 hover:text-red-300"
                    title="حذف"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

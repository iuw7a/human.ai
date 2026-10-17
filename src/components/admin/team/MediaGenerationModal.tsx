"use client";

import { useState } from "react";
import { X, ImagePlus, Video, Loader2, Send, Download, RefreshCw, Zap, AlertTriangle } from "lucide-react";

interface MediaGenerationModalProps {
  isOpen: boolean;
  type: "image" | "video";
  initialPrompt?: string;
  onClose: () => void;
  onInsertMedia: (mediaUrl: string, mediaType: "image" | "video", prompt: string) => void;
}

export function MediaGenerationModal({
  isOpen,
  type,
  initialPrompt = "",
  onClose,
  onInsertMedia,
}: MediaGenerationModalProps) {
  const [activeType, setActiveType] = useState<"image" | "video">(type);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [imageSize, setImageSize] = useState("1024x1024");
  const [videoBackend, setVideoBackend] = useState<"agnes" | "hf">("agnes");
  const [videoModel, setVideoModel] = useState<"flash" | "full">("flash");
  const [videoSeconds, setVideoSeconds] = useState("5");
  const [videoRatio, setVideoRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQueueFull, setIsQueueFull] = useState(false);

  if (!isOpen) return null;

  async function handleGenerate(overrideBackend?: "agnes" | "hf") {
    const p = prompt.trim();
    if (!p || busy) return;
    const currentBackend = overrideBackend ?? videoBackend;

    setBusy(true);
    setError(null);
    setIsQueueFull(false);
    setResultUrl(null);

    try {
      if (activeType === "image") {
        const res = await fetch("/api/admin/tools/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, size: imageSize }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Image generation failed.");
        setResultUrl(json.imageUrl);
      } else {
        // Video Generation
        if (currentBackend === "hf") {
          const res = await fetch("/api/admin/tools/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: p,
              backend: "hf",
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error(j?.error ?? `Hugging Face generation failed (HTTP ${res.status}).`);
          }
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          setResultUrl(objUrl);
        } else {
          // Agnes Video
          const res = await fetch("/api/admin/tools/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: p,
              backend: "agnes",
              model: videoModel,
              seconds: videoSeconds,
              aspect_ratio: videoRatio,
              size: "720P",
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            if (json.code === "video_queue_full" || res.status === 503) {
              setIsQueueFull(true);
            }
            throw new Error(json.error ?? "Video generation failed.");
          }
          const url = json.video_url || json.url;
          if (!url) throw new Error("Video task finished but no URL was returned.");
          setResultUrl(url);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      if (/video_queue_full|queue is full|503/i.test(msg)) {
        setIsQueueFull(true);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleInsert() {
    if (!resultUrl) return;
    onInsertMedia(resultUrl, activeType, prompt);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-ink-950 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg ${
                activeType === "image"
                  ? "bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-cyan-500/20"
                  : "bg-gradient-to-tr from-purple-500 to-pink-600 shadow-purple-500/20"
              }`}
            >
              {activeType === "image" ? (
                <ImagePlus className="h-5 w-5 text-white" />
              ) : (
                <Video className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {activeType === "image" ? "توليد صورة بالذكاء الاصطناعي" : "توليد فيديو بالذكاء الاصطناعي"}
              </h2>
              <p className="text-xs text-zinc-400">
                {activeType === "image"
                  ? "Agnes Image 2.1 Studio (توليد فوري فائق السرعة)"
                  : "استوديو الفيديو الذكي (Agnes Video & Hugging Face)"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-white/[0.08] px-6 py-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveType("image");
              setError(null);
              setIsQueueFull(false);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeType === "image"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ImagePlus size={14} />
            <span>صورة (Image - فوري)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveType("video");
              setError(null);
              setIsQueueFull(false);
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              activeType === "video"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Video size={14} />
            <span>فيديو (Video)</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              الوصف (Prompt)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="صف المشهد بالتفصيل بالإنجليزية أو العربية..."
              className="w-full resize-none rounded-xl border border-white/10 bg-ink-900 p-3 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none"
            />
          </div>

          {activeType === "image" ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                أبعاد الصورة (Resolution)
              </label>
              <div className="flex flex-wrap gap-2">
                {["1024x1024", "1280x720", "720x1280", "1024x768", "768x1024"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setImageSize(s)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                      imageSize === s
                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                        : "border-white/10 bg-ink-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Video Backend Engine */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  محرك معالجة الفيديو (Video Engine)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVideoBackend("agnes")}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                      videoBackend === "agnes"
                        ? "border-purple-500 bg-purple-500/15 text-purple-200"
                        : "border-white/10 bg-ink-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-white">Agnes Video 2.5</p>
                      <p className="text-[10px] text-zinc-400">سيرفر Agnes المخصص</p>
                    </div>
                    {videoBackend === "agnes" && <Zap size={14} className="text-purple-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoBackend("hf")}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                      videoBackend === "hf"
                        ? "border-amber-500 bg-amber-500/15 text-amber-200"
                        : "border-white/10 bg-ink-900 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-white">Hugging Face</p>
                      <p className="text-[10px] text-zinc-400">Hunyuan Video (بديل سريع)</p>
                    </div>
                    {videoBackend === "hf" && <Zap size={14} className="text-amber-400" />}
                  </button>
                </div>
              </div>

              {videoBackend === "agnes" && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-400">النموذج</label>
                    <select
                      value={videoModel}
                      onChange={(e) => setVideoModel(e.target.value as "flash" | "full")}
                      className="w-full rounded-xl border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="flash">Flash (أسرع)</option>
                      <option value="full">Full 2.5 (دقة أعلى)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-400">المدة بالثواني</label>
                    <select
                      value={videoSeconds}
                      onChange={(e) => setVideoSeconds(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      {["4", "5", "6", "8"].map((sec) => (
                        <option key={sec} value={sec}>
                          {sec} ثوانٍ
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-400">نسبة العرض</label>
                    <select
                      value={videoRatio}
                      onChange={(e) => setVideoRatio(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      {["16:9", "9:16", "1:1"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={() => void handleGenerate()}
            disabled={busy || !prompt.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>
                  {activeType === "image"
                    ? "جاري توليد الصورة مع Agnes..."
                    : `جاري معالجة الفيديو عبر ${videoBackend === "hf" ? "Hugging Face" : "Agnes"}...`}
                </span>
              </>
            ) : (
              <span>ابدأ التوليد الآن (Generate)</span>
            )}
          </button>

          {/* Queue Full or Error Notice */}
          {error && (
            <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs">
              <div className="flex items-start gap-2.5 text-amber-200">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">تنبيه من مزود الخدمة:</p>
                  <p className="mt-0.5 text-zinc-300">{error}</p>
                </div>
              </div>

              {isQueueFull && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-500/20 pt-2.5">
                  <button
                    onClick={() => {
                      setVideoBackend("hf");
                      void handleGenerate("hf");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-ink-950 shadow-md shadow-amber-500/20 transition-all hover:bg-amber-400"
                  >
                    <Zap size={13} />
                    <span>التبديل إلى Hugging Face والتوليد فوراً</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveType("image");
                      void handleGenerate();
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/50 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/60"
                  >
                    <ImagePlus size={13} />
                    <span>توليد صورة فوري بدلاً من الفيديو</span>
                  </button>

                  <button
                    onClick={() => void handleGenerate()}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white"
                  >
                    <RefreshCw size={13} />
                    <span>إعادة المحاولة مع Agnes</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Generated Result */}
          {resultUrl && (
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-ink-900/90 p-3">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                {activeType === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resultUrl} alt={prompt} className="max-h-[50vh] w-full object-contain" />
                ) : (
                  <video src={resultUrl} controls autoPlay loop className="max-h-[50vh] w-full" />
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white"
                >
                  <Download size={13} />
                  <span>تنزيل الملف</span>
                </a>

                <button
                  onClick={handleInsert}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
                >
                  <Send size={13} />
                  <span>إدراج في جلسة الدردشة</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

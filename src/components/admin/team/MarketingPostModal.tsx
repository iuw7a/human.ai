"use client";

import { useState } from "react";
import { X, Sparkles, Copy, Check, ImagePlus, RefreshCw, Send, Globe, Share2 } from "lucide-react";

interface MarketingPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertIntoChat: (text: string, suggestedImagePrompt?: string) => void;
  onGenerateImageForPost: (prompt: string) => void;
}

export function MarketingPostModal({
  isOpen,
  onClose,
  onInsertIntoChat,
  onGenerateImageForPost,
}: MarketingPostModalProps) {
  const [platform, setPlatform] = useState<"linkedin" | "twitter" | "instagram" | "facebook" | "blog">("linkedin");
  const [language, setLanguage] = useState<"ar" | "en" | "de" | "mixed">("ar");
  const [angle, setAngle] = useState<string>("random");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleGenerate(forceAngle?: string) {
    setIsGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/team/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_post",
          postOptions: {
            platform,
            language,
            angle: forceAngle || angle,
            customTopic: customTopic.trim() || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate post.");
      setGeneratedPost(data.text);
      setImagePrompt(data.suggestedImagePrompt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopy() {
    if (!generatedPost) return;
    void navigator.clipboard.writeText(generatedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-ink-950 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 shadow-lg shadow-amber-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create Me a New Marketing Post</h2>
              <p className="text-xs text-zinc-400">
                ريما (مديرة الإبداع) تصيغ لك منشورات تسويقية متجددة وغير مكررة للترويج لـ Human AI
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

        {/* Content Area */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Controls Form */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Platform Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                منصة النشر (Platform)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "linkedin", label: "LinkedIn" },
                  { id: "twitter", label: "X / Twitter" },
                  { id: "instagram", label: "Instagram" },
                  { id: "facebook", label: "Facebook" },
                  { id: "blog", label: "Blog Article" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id as typeof platform)}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      platform === p.id
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-white/10 bg-ink-900/60 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                لغة المنشور (Language)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "ar", label: "العربية (Arabic)" },
                  { id: "en", label: "English" },
                  { id: "de", label: "Deutsch (German)" },
                  { id: "mixed", label: "عربي + إنجليزي" },
                ].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLanguage(l.id as typeof language)}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      language === l.id
                        ? "border-purple-500 bg-purple-500/15 text-purple-300"
                        : "border-white/10 bg-ink-900/60 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Marketing Angle Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              زاوية الطرح والفكرة (غير مكرر إطلاقاً)
            </label>
            <select
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="random">🎲 زاوية عشوائية ذكية متجددة (Creative Surprise)</option>
              <option value="Feature Spotlight: Multi-modal Vision & 0.4s Ultra-Speed">
                ⚡ السرعة الفائقة (&lt;0.4s) وفهم الصور المتعدد
              </option>
              <option value="Custom Humi Assistants (/urhumi): Building your specialized AI copilot in 30 seconds">
                🤖 مساعدي Humi المخصصين (/urhumi) — ابنِ مساعدك الخاص
              </option>
              <option value="Comparison: Why Human AI replaces 4 separate bloated AI tools">
                🥊 المقارنة والتوفير — لماذا يستبدل Human AI أربعة اشتراكات باهظة
              </option>
              <option value="Developer & Productivity Power: Code, analysis, and instant workflow automation">
                💻 للمبرمجين وصناع المحتوى — أتمتة الأعمال وإنتاج الكود
              </option>
              <option value="Data Privacy & European AI Excellence: Privacy-first architecture without vendor lock-in">
                🔒 الخصوصية الصارمة والأمان الأوروبي
              </option>
              <option value="Founder & Vision Story: Building the future of intelligent human-AI collaboration">
                🌟 قصة الرؤية والمؤسسين — بناء منصة ذكاء عالمية
              </option>
            </select>
          </div>

          {/* Optional custom instructions */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              موضوع مخصص أو توجيه إضافي (اختياري)
            </label>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="مثال: ركزي على ميزة الرؤية، أو خصم خاص، أو تحديث جديد اليوم..."
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>ريما تقوم بصياغة منشور فريد الآن...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>صياغة منشور تسويقي جديد مع ريما (Create Post)</span>
              </>
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Generated Result Preview */}
          {generatedPost && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-ink-900/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <Share2 size={13} />
                  <span>المنشور المقترح للنشر على {platform.toUpperCase()}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-all hover:bg-white/10 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400">تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>نسخ المنشور</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onInsertIntoChat(generatedPost, imagePrompt ?? undefined)}
                    className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-medium text-cyan-300 transition-all hover:bg-cyan-900/60"
                  >
                    <Send size={12} />
                    <span>إرسال للدردشة</span>
                  </button>
                </div>
              </div>

              {/* Text content */}
              <div className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/40 p-3.5 text-[13px] leading-relaxed text-zinc-100">
                {generatedPost}
              </div>

              {/* Suggested Image Prompt */}
              {imagePrompt && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-500/30 bg-purple-950/30 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-purple-300">
                      🎨 فكرة صورة مقترحة للمنشور (Agnes Studio):
                    </p>
                    <p className="line-clamp-2 text-[11px] text-zinc-400">{imagePrompt}</p>
                  </div>
                  <button
                    onClick={() => onGenerateImageForPost(imagePrompt)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-purple-600/30 hover:bg-purple-500"
                  >
                    <ImagePlus size={13} />
                    <span>توليد الصورة فوراً</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

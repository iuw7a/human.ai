"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StatusPill } from "@/components/admin/ui";

export interface FreeGalleryModel {
  id: string;
  name: string;
  provider: string;
  providerModelId: string;
  vision: boolean;
  enabled: boolean;
  plan: string;
}

export interface FreeGalleryGateway {
  key: string;
  label: string;
  has_key: boolean;
  reachable: boolean | null;
  needs_topup: boolean;
  last_billing_error: string | null;
  billing_fails: number;
  topup_url: string | null;
  modelCount: number | null;
}

const GATEWAY_META: Record<string, { letter: string; color: string; limit: string }> = {
  kira: { letter: "K", color: "bg-violet-500/15 text-violet-300 ring-violet-500/40", limit: "موديلات kira-* على باقتك · الموديلات الشريكة تحتاج محفظة VND" },
  codecraft: { letter: "C", color: "bg-sky-500/15 text-sky-300 ring-sky-500/40", limit: "1M توكن مجاني كل شهر — يخلص بانتهاء الشهر" },
  bynara: { letter: "N", color: "bg-blue-500/15 text-blue-300 ring-blue-500/40", limit: "7M توكن يومياً على المجانية — يخلص آخر اليوم ويتجدد" },
  openrouter: { letter: "O", color: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40", limit: "50 طلب باليوم على الموديلات المجانية — يخلص ويتجدد منتصف الليل" },
  ollama: { letter: "L", color: "bg-amber-500/15 text-amber-300 ring-amber-500/40", limit: "حصة مجانية محدودة — خلصت حالياً، تنتظر التجديد أو Pro" },
  xkiro: { letter: "X", color: "bg-teal-500/15 text-teal-300 ring-teal-500/40", limit: "موديلات free على حصتك — المجانية تشتغل بدون بطاقة" },
  nvidia: { letter: "H", color: "bg-green-500/15 text-green-300 ring-green-500/40", limit: "شغال على مفتاح السيرفر الخاص فيك" },
  groq: { letter: "G", color: "bg-orange-500/15 text-orange-300 ring-orange-500/40", limit: "شغال على مفتاح السيرفر الخاص فيك" },
  ifm: { letter: "I", color: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/40", limit: "شغال على مفتاح السيرفر الخاص فيك" },
  agnes: { letter: "A", color: "bg-pink-500/15 text-pink-300 ring-pink-500/40", limit: "توليد صور على مفتاح السيرفر" },
};

function describe(id: string, providerModelId: string, vision: boolean): string {
  const s = `${id} ${providerModelId}`.toLowerCase();
  if (/image|banana|imagen|draw|art|vision-image/.test(s) && !vision) return "يولّد صور من وصف نصي — اكتب الفكرة ويعطيك صورة.";
  if (/tts|voice|audio|speech/.test(s)) return "يحوّل النص المكتوب لكلام مسموع بأصوات طبيعية.";
  if (/video/.test(s)) return "يولّد مقاطع فيديو قصيرة من الوصف.";
  if (/code|coder|dev|program/.test(s)) return "متخصص بالبرمجة: يكتب كود، يصلح أخطاء، ويشرح لك خطوة خطوة.";
  if (/opus|max|ultra|pro|reason|think|includ|fable|mythos|wizard|4-8|5-5/.test(s))
    return "من أقوى الموديلات: يفكر بعمق قبل ما يجاوب — للمسائل الصعبة والشغل المهم.";
  if (/flash|lite|mini|nano|small|air|haiku|luna|27b|20b|8b|7b/.test(s))
    return "موديل خفيف وسريع: رد فوري للأسئلة اليومية والاستخدام الخفيف.";
  if (vision) return "موديل محادثة يفهم الصور والنص معاً — اسأله أو ابعت له صورة.";
  return "موديل محادثة عام: أسئلة وأجوبة، كتابة، وشرح بأسلوب بسيط.";
}

export function FreeModelsGallery({
  models,
  gateways,
  failedSlugs,
}: {
  models: FreeGalleryModel[];
  gateways: FreeGalleryGateway[];
  failedSlugs: string[];
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const failedSet = useMemo(() => new Set(failedSlugs), [failedSlugs]);

  const needsCard = (m: FreeGalleryModel) =>
    failedSet.has(m.id) || (m.provider === "kira" && !m.providerModelId.startsWith("kira-"));

  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))].sort(), [models]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return models.filter((m) => {
      if (tab !== "all" && m.provider !== tab) return false;
      if (onlyProblems && m.enabled && !needsCard(m)) return false;
      if (query && !(m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query))) return false;
      return true;
    });
  }, [models, tab, q, onlyProblems, failedSet]);

  const gwByKey = useMemo(() => new Map(gateways.map((g) => [g.key, g])), [gateways]);

  return (
    <div className="space-y-4">
      {/* Plain-language explainer */}
      <div className="grid gap-2 md:grid-cols-4">
        {[
          { t: "شو يعني بوابة؟", d: "شركة وسيطة تعطيك مفتاح واحد يفتح لك عشرات الموديلات بدل ما تسجل بكل شركة." },
          { t: "شو يعني ليمت؟", d: "عدد مجاني محدود — مثلاً 50 طلب باليوم. لما يخلص، الموديل يوقف لحد ما يتجدد." },
          { t: "متى يخلص؟", d: "كل بوابة لها عدّاد: يومي يتجدد آخر اليوم، أو شهري يتجدد أول الشهر." },
          { t: "شو يعني يحتاج بطاقة؟", d: "رصيد البوابة خلص. تشحن من موقعهم ويرجع يشتغل فوراً — الشارة الحمراء تدلك." },
        ].map((c, i) => (
          <motion.div
            key={c.t}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
            className="card p-4"
          >
            <p className="text-sm font-semibold text-white">{c.t}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">{c.d}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دوّر على موديل…"
          className="input min-w-52 flex-1"
        />
        <button
          onClick={() => setOnlyProblems((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
            onlyProblems ? "bg-red-500/15 text-red-200 ring-red-500/40" : "bg-ink-850 text-zinc-500 ring-ink-700 hover:text-zinc-200"
          }`}
        >
          اللي يحتاج بطاقة فقط
        </button>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...providers]).map((p) => (
            <button
              key={p}
              onClick={() => setTab(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                tab === p ? "bg-accent/15 text-white ring-accent/40" : "bg-ink-850 text-zinc-500 ring-ink-700 hover:text-zinc-200"
              }`}
            >
              {p === "all" ? `الكل (${models.length})` : `${gwByKey.get(p)?.label ?? p} (${models.filter((m) => m.provider === p).length})`}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-zinc-500">{visible.length} موديل ظاهر</p>

      {/* Cards */}
      <motion.div layout className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((m, i) => {
          const meta = GATEWAY_META[m.provider] ?? { letter: m.provider.slice(0, 1).toUpperCase(), color: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/40", limit: "" };
          const card = needsCard(m);
          const gw = gwByKey.get(m.provider);
          return (
            <motion.div
              layout
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4), duration: 0.3 }}
              className={`card space-y-2 p-4 transition-colors hover:border-accent/40 ${card ? "border-red-500/30" : ""} ${!m.enabled ? "opacity-70" : ""}`}
            >
            <Link href={`/admin/models/free/${encodeURIComponent(m.id)}`} className="block space-y-2">
              <div className="flex items-center gap-2.5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ring-1 ${meta.color}`}>
                  {meta.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{m.name}</p>
                  <p className="truncate text-[11px] text-zinc-500">{gw?.label ?? m.provider}</p>
                </div>
                {card ? <StatusPill value="يحتاج بطاقة" tone="red" /> : m.enabled ? <StatusPill value="شغال" tone="green" /> : <StatusPill value="مطفي" tone="gray" />}
              </div>
              <p className="text-xs leading-5 text-zinc-300">{describe(m.id, m.providerModelId, m.vision)}</p>
              <p className="text-[11px] leading-5 text-zinc-500">⏳ {meta.limit || "—"}</p>
              <p className="truncate font-mono text-[10px] text-zinc-600">{m.id}</p>
              <p className="text-[11px] font-medium text-accent">التفاصيل والشات ←</p>
            </Link>
            </motion.div>
          );
        })}
      </motion.div>
      {visible.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">ما في نتيجة — جرّب كلمة ثانية.</p>}
    </div>
  );
}

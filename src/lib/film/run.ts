/**
 * The Text → Film agent pipeline, shared by the admin tool route and the public
 * sandbox route so both behave identically.
 *
 * classify (small) → plan (medium) → images in parallel → film HTML (large,
 * escalate only on a failed check) → validate → preview.
 *
 * SERVER ONLY. The caller supplies a `send` sink (SSE) and gets the result back.
 */

import { agnesGenerateImage } from "@/lib/agnes";
import { callWithEscalation, classify, TIERS, type CallContext, type FilmUsage } from "@/lib/film/router";
import { extractHtml, fallbackFilm, validateFilm } from "@/lib/film/film";
import {
  buildFilmUser,
  buildPlanUser,
  filmSystemPrompt,
  parsePlan,
  planSystemPrompt,
  type FilmPlan,
} from "@/lib/film/prompts";
import type { ChatMessageInput } from "@/lib/providers/types";

export const FILM_TASKS = [
  "تصنيف الطلب بالموديل الصغير",
  "كتابة الخطة وقائمة المهام بالموديل المتوسط",
  "توليد الصور المطلوبة بالتوازي",
  "كتابة كود الفيلم (HTML واحد) بالموديل الكبير",
  "فحص الكود قبل التسليم",
  "فتح الفيلم في لوحة المعاينة",
];

export const MAX_IMAGES = 4;

export interface FilmImage {
  url: string;
  prompt: string;
}

export interface FilmRunResult {
  title: string;
  plan: FilmPlan;
  images: FilmImage[];
  html: string;
  ok: boolean;
  model: string;
  scenes: number;
  totalTokens: number;
}

export interface RunFilmOptions {
  brief: string;
  userId?: string | null;
  maxImages?: number;
  /** SSE sink. Receives every event exactly as the admin tool expects. */
  send: (ev: Record<string, unknown>) => void;
}

/** Pull a duration (5–180s) out of the brief, else default to 30s. */
export function guessDuration(brief: string): number {
  const m = brief.match(/(\d{1,3})\s*(?:ثانية|ثواني|ثوان|sec|secs|second|seconds|s\b)/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 5 && n <= 180) return n;
  }
  return 30;
}

export async function runFilmPipeline(opts: RunFilmOptions): Promise<FilmRunResult> {
  const { brief, send } = opts;
  const maxImages = opts.maxImages ?? MAX_IMAGES;
  const doneCount = FILM_TASKS.map(() => false);
  const status = (text: string) => send({ kind: "status", text });
  const sendTasks = () =>
    send({ kind: "tasks", items: FILM_TASKS.map((t, i) => ({ text: t, done: doneCount[i] })) });
  const doneTask = (index: number) => {
    doneCount[index] = true;
    sendTasks();
  };

  let totalTokens = 0;
  const ctx: CallContext = {
    userId: opts.userId ?? null,
    onUsage: async (u: FilmUsage) => {
      totalTokens += u.totalTokens;
      send({
        kind: "usage",
        step: u.tier === "small" ? "classify" : u.tier === "medium" ? "plan" : "film",
        ...u,
      });
    },
  };

  const duration = guessDuration(brief);
  sendTasks();
  status("وقّع طلبك — أبدأ التصنيف بالموديل الصغير.");
  send({ kind: "echo", brief, duration });

  // 1) classify (small)
  let label = "film";
  try {
    const c = await classify(brief, ctx);
    label = c.label;
  } catch {
    label = "film";
  }
  status(
    label === "film"
      ? "الطلب فيلم — سأبنيه كصفحة ويب حية (ما بقدر أصدّر MP4)."
      : `صنّفته كـ «${label}» لكن الأداة تبني فيلم — بأكمله كفيلم.`
  );
  doneTask(0);

  // 2) plan (medium)
  status("أخطط للفيلم والمشاهد بالموديل المتوسط…");
  const planMessages: ChatMessageInput[] = [
    { role: "system", content: planSystemPrompt() },
    { role: "user", content: buildPlanUser(brief, duration) },
  ];
  let plan: FilmPlan;
  try {
    const planRes = await callWithEscalation("medium", planMessages, (t) => t.includes("{") && t.includes("}"), ctx);
    plan = parsePlan(planRes.result.text, brief, duration);
  } catch {
    plan = parsePlan("", brief, duration);
    status("تعذّر التخطيط — استخدمت خطة احتياطية.");
  }
  send({ kind: "plan", plan });
  status(`الخطة جاهزة: «${plan.title}» — ${plan.scenes.length} مشاهد / ${plan.duration} ثانية.`);
  doneTask(1);

  // 3) images in parallel (never sequential)
  const prompts = plan.imagePrompts.slice(0, maxImages);
  const images: FilmImage[] = [];
  let ready = 0;
  if (prompts.length) {
    status(`أولّد ${prompts.length} صور بالتوازي — راح تظهر أول ما تجهز.`);
    await Promise.all(
      prompts.map((prompt, index) =>
        agnesGenerateImage({ prompt: prompt.slice(0, 2000), size: "1280x720" })
          .then((out) => {
            images.push({ url: out.url, prompt });
            ready += 1;
            send({ kind: "image", index, total: prompts.length, ready, url: out.url, prompt: prompt.slice(0, 140) });
            status(`${ready} من ${prompts.length} صور جاهزة.`);
          })
          .catch((e: unknown) => {
            send({
              kind: "image-error",
              index,
              prompt: prompt.slice(0, 120),
              message: e instanceof Error ? e.message : "تعذّر توليد الصورة.",
            });
            status(`صورة رقم ${index + 1} فشلت — بأكمل بدونها.`);
          })
      )
    );
  }
  doneTask(2);

  // 4) film HTML (large) with escalation on check failure
  status(`أكتب كود الفيلم بالموديل الكبير (${TIERS.large.chain[0]})…`);
  const filmMessages: ChatMessageInput[] = [
    { role: "system", content: filmSystemPrompt() },
    { role: "user", content: buildFilmUser({ brief, plan, images, duration: plan.duration }) },
  ];
  let html = "";
  let usedModel = "";
  let usedTier = "";
  let escalated = false;
  let checkProblems: string[] = [];
  try {
    const filmRes = await callWithEscalation("large", filmMessages, (t) => validateFilm(extractHtml(t)).ok, ctx);
    html = extractHtml(filmRes.result.text);
    usedModel = filmRes.result.slug;
    usedTier = filmRes.result.tier;
    escalated = filmRes.tried.length > 1;
    const check = validateFilm(html);
    checkProblems = check.problems;
    if (!check.ok) {
      status(`فحص الكود ما نجح (${check.problems.slice(0, 2).join("، ")}) — أستخدم قالب الفيلم الاحتياطي.`);
      html = fallbackFilm(plan, images, brief);
      usedModel = usedModel ? `${usedModel} → قالب احتياطي` : "قالب احتياطي";
    }
  } catch (e) {
    status("تعذّر كتابة كود الفيلم بالموديلات — أستخدم قالب الفيلم الاحتياطي.");
    html = fallbackFilm(plan, images, brief);
    usedModel = "قالب احتياطي";
    checkProblems = [e instanceof Error ? e.message : "unknown"];
  }
  const finalCheck = validateFilm(html);
  send({
    kind: "code",
    model: usedModel,
    tier: usedTier || "large",
    escalated,
    ok: finalCheck.ok,
    problems: finalCheck.ok ? [] : checkProblems,
    bytes: html.length,
  });
  doneTask(3);
  status(finalCheck.ok ? "فحص الكود نجح ✅" : "فحص الكود فيه ملاحظات — سلّمت أفضل نتيجة متاحة.");
  doneTask(4);

  // 5) open preview
  send({ kind: "preview", title: plan.title, html, duration: plan.duration });
  status("فتحت الفيلم بلوحة المعاينة — اضغط تشغيل مع الصوت 🔊");
  doneTask(5);

  send({
    kind: "done",
    title: plan.title,
    model: usedModel,
    ok: finalCheck.ok,
    images: images.length,
    scenes: plan.scenes.length,
  });

  return {
    title: plan.title,
    plan,
    images,
    html,
    ok: finalCheck.ok,
    model: usedModel,
    scenes: plan.scenes.length,
    totalTokens,
  };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  ArrowUp,
  Brain,
  Check,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileDiff,
  FileText,
  Hammer,
  Loader2,
  Rocket,
  Sparkles,
  Globe,
  Paintbrush,
  Gamepad2,
  Plus,
  RefreshCw,
  Smartphone,
  Monitor,
  Dices,
} from "lucide-react";

/* ───────────────── Types ───────────────── */

interface VFile {
  path: string;
  content: string;
}

interface Msg {
  role: "user" | "assistant";
  text: string;
}

interface Question {
  id: string;
  label: string;
  type: "text" | "choice" | "color" | "style";
  placeholder?: string;
  options?: string[];
}

interface Step {
  kind: "thinking" | "sandbox" | "writing" | "wrote" | "serving" | "done";
  text: string;
  file?: string;
}

type Phase = "idle" | "discuss" | "working";

/* ───────────────── Constants ───────────────── */

const GREETING = "What are we building today?";

const QUICK_CATEGORIES = [
  { id: "landing", label: "Landing Page", icon: Globe, promptPrefix: "I want to build a high-converting landing page for " },
  { id: "website", label: "Website", icon: Monitor, promptPrefix: "I want to build a modern website for " },
  { id: "webapp", label: "Web App", icon: Smartphone, promptPrefix: "I want to build a functional web application for " },
  { id: "game", label: "Browser Game", icon: Gamepad2, promptPrefix: "I want to build an interactive browser game: " },
];

const GAME_IDEAS_LIST = [
  { title: "Retro Snake Game", genre: "Arcade", desc: "Classic snake with smooth controls, score tracking and colorful themes" },
  { title: "Chess Challenge", genre: "Strategy", desc: "2-player interactive chess board with legal move highlights and clock" },
  { title: "Flappy Plane", genre: "Physics", desc: "Fast-paced tap-to-fly obstacle avoider with particle effects" },
  { title: "Space Invaders", genre: "Shooter", desc: "Defend against alien waves with shields, lasers, and boss fights" },
  { title: "Memory Card Match", genre: "Puzzle", desc: "Card flipping memory game with animated cards and timer" },
  { title: "2048 Number Merge", genre: "Puzzle", desc: "Slide tiles on a 4x4 grid to merge matching numbers to 2048" },
  { title: "Breakout Brick Crusher", genre: "Action", desc: "Paddle and bouncing ball with power-ups and multi-colored bricks" },
  { title: "Tower Defense Mini", genre: "Strategy", desc: "Place defensive turrets along paths to stop incoming waves" },
  { title: "Whack-A-Mole", genre: "Reaction", desc: "High-speed reflex tapping game with combos and sound effects" },
  { title: "Tic-Tac-Toe Pro", genre: "Classic", desc: "Clean neon tic-tac-toe with unbeatable minimax AI mode" },
];

const SUGGESTIONS = [
  { icon: Sparkles, label: "Help me get things done", color: "from-violet-500/20 to-violet-500/5" },
  { icon: Globe, label: "Build me a landing page", color: "from-sky-500/20 to-sky-500/5" },
  { icon: Paintbrush, label: "Design a portfolio site", color: "from-amber-500/20 to-amber-500/5" },
  { icon: Gamepad2, label: "Make a browser game", color: "from-emerald-500/20 to-emerald-500/5" },
];

const SMALLTALK =
  /^(yo|hi+|hey+|hallo+|hello+|servus|moin|na+|ok|okay+|danke\w*|thanks?|thank\s+you|bitte|gerne|ja|nein|yes|no+|wie\s+geht'?s\??|wer\s+bist\s+du\??|who\s+are\s+you[^!?.…]{0,20}|مرحب[ااً]?|هلا+|اهلا|أهلا|سهلا|السلام عليكم|عليكم السلام|صباح الخير|مساء الخير|شلونك|شلونج|كيفك|كيف حالك|شخبارك|شو اخبارك|تمام|زين|ماشي|طيب|نعم|اي|لا|شكرا|ممنون|ممنونة|تسلم|تسلمين|عاشت ايدك|عفوا|مع السلامة|باي|من انت|مين انت)\s*[!?.…؟]*$/i;

const BUILD_INTENT =
  /(ابن[يي]|سوي|اعمل|موقع|صفحة|website|webseite|web-site|landing|build|creat\w*\s+(a\s+)?(site|page|web)|erstell|bau\s+mir|mach\s+mir|i\s+(want|need)\s+a\s+(site|website|page))/i;

const CHANGE_INTENT =
  /(غيّر|غير|عدّل|عدل|أضف|اضف|احذف|بدّل|بدل|ضيف|شيل|change|add|remove|delete|update|edit|fix|mach|ändere|füg|entferne|besser|schneller)/i;

function langOf(text: string): "ar" | "de" | "en" {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[äöüß]|(?:\b(?:der|die|das|und|nicht|kann|gib|mir|eine|ist|bin|den|danke|hallo|hey|bist|eine)\b)/i.test(text)) return "de";
  return "en";
}

function smalltalkReply(text: string): string | null {
  if (!SMALLTALK.test(text.trim())) return null;
  switch (langOf(text)) {
    case "ar":
      return "مرحبا! أنا Humi، رفيق البناء. شو حابب تبني اليوم؟ اوصف لي الموقع اللي ببالك.";
    case "de":
      return "Hey! Ich bin Humi, dein Bau-Buddy. Was soll ich dir bauen? Beschreib mir einfach die Website.";
    default:
      return "Hey! I'm Humi, your build buddy. What should I build for you? Just describe the website.";
  }
}

function needDetailsReply(brief: string): string {
  switch (langOf(brief || "hello")) {
    case "ar":
      return "ما أقدر أبني من هالوصف — أعطيني تفاصيل أكثر: شو نوع الموقع؟ شو فيه؟ لمين؟";
    case "de":
      return "Damit kann ich nichts bauen — gib mir mehr Details: Was für eine Website? Was steht drauf? Für wen?";
    default:
      return "I can't build from that — give me more details: what kind of site? What's on it? Who is it for?";
  }
}

function stepIcon(kind: Step["kind"]) {
  switch (kind) {
    case "thinking":
    case "sandbox":
      return <Brain size={14} className="shrink-0 text-violet-400" />;
    case "writing":
      return <FileText size={14} className="shrink-0 animate-pulse text-amber-400" />;
    case "wrote":
      return <Check size={14} className="shrink-0 text-emerald-400" />;
    case "serving":
      return <Eye size={14} className="shrink-0 text-sky-400" />;
    default:
      return <Hammer size={14} className="shrink-0 text-zinc-500" />;
  }
}

/* ───────────────── Component ───────────────── */

export function BuildView({ initialProjectId }: { initialProjectId?: string }) {
  const [phase, setPhase] = useState<Phase>(initialProjectId ? "working" : "idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<VFile[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [sandboxId, setSandboxId] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [changedPaths, setChangedPaths] = useState<string[]>([]);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState("");
  const [publishing, setPublishing] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const projectIdRef = useRef(initialProjectId || "");
  const [projUserId, setProjUserId] = useState("");
  const [projEmail, setProjEmail] = useState("");
  const [pubUrl, setPubUrl] = useState("");
  const [pubMsg, setPubMsg] = useState<string | null>(null);
  const [bgOk, setBgOk] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [gameIdeaOffset, setGameIdeaOffset] = useState(0);
  const [isGame, setIsGame] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleCategoryClick(catId: string) {
    const cat = QUICK_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;

    if (cat.id === "game") {
      setShowGameModal(true);
      setIsGame(true);
      return;
    }

    setIsGame(false);
    setDraft(cat.promptPrefix);
    if (textareaRef.current) {
      textareaRef.current.focus();
      const len = cat.promptPrefix.length;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }

  function handleSelectGameIdea(idea: { title: string; desc: string }) {
    setShowGameModal(false);
    setIsGame(true);
    const fullPrompt = `I want to build an interactive browser game: ${idea.title} - ${idea.desc}`;
    setDraft(fullPrompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }

  function shuffleGameIdeas() {
    setGameIdeaOffset((prev) => (prev + 3) % GAME_IDEAS_LIST.length);
  }

  const visibleGameIdeas = [
    GAME_IDEAS_LIST[(gameIdeaOffset) % GAME_IDEAS_LIST.length],
    GAME_IDEAS_LIST[(gameIdeaOffset + 1) % GAME_IDEAS_LIST.length],
    GAME_IDEAS_LIST[(gameIdeaOffset + 2) % GAME_IDEAS_LIST.length],
  ];

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Load project if opened with an existing project ID
  useEffect(() => {
    if (!initialProjectId) return;
    setBusy(true);
    fetch(`/api/build/projects/${initialProjectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.project) {
          const p = j.project;
          setProjectId(p.id);
          projectIdRef.current = p.id;
          if (p.title) setBrief(p.title);
          if (p.files && Array.isArray(p.files)) {
            setFiles(p.files);
            if (p.files[0]?.path) setActiveFile(p.files[0].path);
          }
          if (p.sandbox_id) setSandboxId(p.sandbox_id);
          if (p.preview_url) setPreviewUrl(p.preview_url);
          if (p.subdomain) setSub(p.subdomain);
          setPhase("working");
          setMessages([
            {
              role: "assistant",
              text: `Loaded project **${p.title || p.id}**. You can chat to make changes, or view and edit the code.`,
            },
          ]);
        }
      })
      .catch((e) => {
        setError("Failed to load project session.");
      })
      .finally(() => {
        setBusy(false);
      });
  }, [initialProjectId]);

  const [skills, setSkills] = useState<{ id: string; name: string; description: string; preview?: string; game: boolean }[]>([]);
  const visibleSkills = skills.filter((skill) => skill.game === isGame);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

  useEffect(() => {
    fetch("/api/build/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.skills?.length) setSkills(j.skills);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setProjUserId(data.user.id);
        setProjEmail(data.user.email ?? "user");
      }
    });
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, steps]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [draft]);

  /* ───────── Chat logic (unchanged) ───────── */

  async function chatReply(history: Msg[]) {
    const res = await fetch("/api/build/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-10).map((m) => ({ role: m.role, content: m.text })) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? "Chat failed.");
    return j.reply as string;
  }

  async function discuss() {
    const text = draft.trim();
    if (!text || busy) return;

    // Immediately ensure project ID and URL update to /build/chat/new/[id]
    let currentPid = projectIdRef.current;
    if (!currentPid) {
      try {
        const cres = await fetch("/api/build/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text.slice(0, 80), brief: text }),
        });
        const cj = await cres.json().catch(() => null);
        if (cres.ok && cj?.project?.id) {
          const newId = cj.project.id;
          setProjectId(newId);
          projectIdRef.current = newId;
          currentPid = newId;
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `/build/chat/new/${newId}`);
          }
        }
      } catch {
        /* ignore */
      }
    }

    const st = smalltalkReply(text);
    if (st) {
      setDraft("");
      setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: st }]);
      if (phase === "idle") setPhase("discuss");
      return;
    }
    if (!BUILD_INTENT.test(text)) {
      setDraft("");
      setError(null);
      setBusy(true);
      const history: Msg[] = [...messages, { role: "user", text }];
      setMessages(history);
      try {
        const reply = await chatReply(history);
        setMessages([...history, { role: "assistant", text: reply }]);
        if (phase === "idle") setPhase("discuss");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Chat failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setDraft("");
    setError(null);
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", text }]);

    // Ensure a project ID exists and update URL immediately
    void (async () => {
      try {
        let pid = projectIdRef.current;
        if (!pid) {
          const cres = await fetch("/api/build/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: text.slice(0, 80), brief: text }),
          });
          const cj = await cres.json().catch(() => null);
          if (cres.ok && cj?.project?.id) {
            pid = cj.project.id;
            setProjectId(pid);
            projectIdRef.current = pid;
            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", `/build/chat/new/${pid}`);
            }
          }
        }
      } catch {
        /* non-fatal */
      }
    })();

    try {
      const res = await fetch("/api/build/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, isGame }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Planning failed.");
      setBrief(text);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: j.reply ?? "Got it — a few quick questions." },
      ]);
      const planQs: Question[] = j.questions ?? [];
      if (skills.length > 0 && !planQs.some((q) => q.type === "style")) {
        planQs.push({ id: "__style", label: "Which style?", type: "style" });
      }
      setQuestions(planQs);
      setAnswers({});
      setPhase("discuss");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startBuild(instruction?: string) {
    const spec = instruction?.trim() ?? buildSpec();
    if (!spec || busy) return;
    if (!instruction && brief.trim().length < 10) {
      setMessages((prev) => [...prev, { role: "assistant", text: needDetailsReply(brief) }]);
      return;
    }
    setError(null);
    setBusy(true);
    setSteps([]);
    setChangedPaths([]);
    const history: Msg[] = instruction
      ? [...messages, { role: "user", text: spec }]
      : messages;
    if (instruction) setMessages(history);
    setPhase("working");

    // Immediately ensure project ID exists and URL is /build/chat/new/[pid]
    void (async () => {
      try {
        let pid = projectIdRef.current;
        if (!pid) {
          const cres = await fetch("/api/build/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: (brief || spec || "Untitled site").slice(0, 80), brief: brief || spec }),
          });
          const cj = await cres.json().catch(() => null);
          if (cres.ok && cj?.project?.id) {
            pid = cj.project.id;
            setProjectId(pid);
            projectIdRef.current = pid;
          }
        }
        if (pid && typeof window !== "undefined") {
          window.history.replaceState(null, "", `/build/chat/new/${pid}`);
        }
      } catch {
        /* ignore */
      }
    })();

    try {
      const res = await fetch("/api/build/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sandboxId
            ? { sandboxId, files, instruction: spec, skillId: answers["__style"] || undefined, isGame }
            : { prompt: spec, skillId: answers["__style"] || undefined, isGame }
        ),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Build failed (${res.status}).`);
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
          if (data === "[DONE]") break;
          try {
            const json = JSON.parse(data) as {
              step?: Step["kind"];
              text?: string;
              file?: string;
              done?: boolean;
              error?: string;
              sandboxId?: string;
              files?: VFile[];
              previewUrl?: string;
              summary?: string;
              changes?: { path: string; kind: string }[];
            };
            if (json.error) throw new Error(json.error);
            if (json.step) {
              setSteps((prev) => {
                if (json.file && (json.step === "writing" || json.step === "wrote")) {
                  const without = prev.filter((s) => s.file !== json.file);
                  return [...without, { kind: json.step!, text: json.text ?? "", file: json.file }];
                }
                return [...prev, { kind: json.step!, text: json.text ?? "" }];
              });
            }
            if (json.done) {
              const sid = json.sandboxId ?? "";
              const f = (json.files ?? []) as VFile[];
              const pu = json.previewUrl ?? "";
              setSandboxId(sid);
              setFiles(f);
              setActiveFile(f[0]?.path ?? "");
              setPreviewUrl(pu);
              setChangedPaths((json.changes ?? []).filter((c) => c.kind !== "same").map((c) => c.path));
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text: `Done — ${json.summary ?? "site built"}. Preview is live on the right.`,
                },
              ]);
              void (async () => {
                try {
                  let pid = projectIdRef.current;
                  if (!pid) {
                    const cres = await fetch("/api/build/projects", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: (brief || "Untitled site").slice(0, 80), brief }),
                    });
                    const cj = await cres.json().catch(() => null);
                    if (cres.ok && cj?.project?.id) {
                      pid = cj.project.id;
                      setProjectId(pid);
                      projectIdRef.current = pid;
                      if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", `/build/chat/new/${pid}`);
                      }
                    }
                  }
                  if (pid) {
                    if (typeof window !== "undefined" && !window.location.pathname.includes(pid)) {
                      window.history.replaceState(null, "", `/build/chat/new/${pid}`);
                    }
                    await fetch(`/api/build/projects/${pid}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: (brief || "Untitled site").slice(0, 80),
                        brief,
                        files: f,
                        sandbox_id: sid,
                        preview_url: pu,
                      }),
                    }).catch(() => {});
                  }
                } catch {
                  /* non-fatal */
                }
              })();
              break;
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Build failed: ${e instanceof Error ? e.message : "unknown error"}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function buildSpec(): string {
    const parts = [brief];
    for (const q of questions) {
      if (q.id === "__style") continue;
      const a = (answers[q.id] ?? "").trim();
      if (a) parts.push(`${q.label} ${a}`);
    }
    const styleName = skills.find((s) => s.id === answers["__style"])?.name;
    if (styleName) parts.push(`Design style: ${styleName}`);
    return parts.filter(Boolean).join("\n");
  }

  function followUp() {
    const text = draft.trim();
    if (!text || busy) return;
    const st = smalltalkReply(text);
    if (st) {
      setDraft("");
      setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: st }]);
      return;
    }
    if (!CHANGE_INTENT.test(text) && !BUILD_INTENT.test(text)) {
      setDraft("");
      setError(null);
      setBusy(true);
      const history: Msg[] = [...messages, { role: "user", text }];
      setMessages(history);
      chatReply(history)
        .then((reply) => setMessages([...history, { role: "assistant", text: reply }]))
        .catch((e) => setError(e instanceof Error ? e.message : "Chat failed."))
        .finally(() => setBusy(false));
      return;
    }
    setDraft("");
    void startBuild(text);
  }

  const active = files.find((f) => f.path === activeFile);
  const empty = messages.length === 0;

  /* ───────── Suggestion chip click ───────── */
  function handleSuggestion(label: string) {
    setDraft(label);
    // Trigger discuss on next tick so the textarea updates
    setTimeout(() => {
      setDraft(label);
      void (async () => {
        const text = label.trim();
        if (!text || busy) return;
        const st = smalltalkReply(text);
        if (st) {
          setDraft("");
          setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: st }]);
          if (phase === "idle") setPhase("discuss");
          return;
        }
        setDraft("");
        setError(null);
        setBusy(true);
        const history: Msg[] = [...messages, { role: "user", text }];
        setMessages(history);
        try {
          if (BUILD_INTENT.test(text)) {
            const res = await fetch("/api/build/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: text }),
            });
            const j = await res.json().catch(() => null);
            if (!res.ok) throw new Error(j?.error ?? "Planning failed.");
            setBrief(text);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", text: j.reply ?? "Got it — a few quick questions." },
            ]);
            const planQs: Question[] = j.questions ?? [];
            if (skills.length > 0 && !planQs.some((q) => q.type === "style")) {
              planQs.push({ id: "__style", label: "Which style?", type: "style" });
            }
            setQuestions(planQs);
            setAnswers({});
          } else {
            const reply = await chatReply(history);
            setMessages([...history, { role: "assistant", text: reply }]);
          }
          setPhase("discuss");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed.");
        } finally {
          setBusy(false);
        }
      })();
    }, 0);
  }

  /* ───────── Bubbles ───────── */

  function assistantBubble(m: Msg, i: number, showQuestions: boolean) {
    return (
      <div
        key={i}
        className="flex gap-3 animate-[fadeSlideUp_0.3s_ease-out_both]"
        style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Human AI"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white/[0.08]"
          />
          <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0f] bg-emerald-400" />
        </div>
        {/* Bubble */}
        <div className="group min-w-0 max-w-[85%] flex-1">
          <div className="rounded-2xl rounded-tl-md border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.25)] backdrop-blur-md transition-all duration-200 hover:border-white/[0.1]">
            <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-zinc-200">{m.text}</p>
            {showQuestions && (
              <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                {questions.map((q) => (
                  <div key={q.id}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">{q.label}</p>
                    {q.type === "text" && (
                      <input
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                        placeholder={q.placeholder ?? "Type here…"}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-accent/50 focus:bg-white/[0.05] focus:outline-none"
                      />
                    )}
                    {q.type === "choice" && (
                      <div className="flex flex-wrap gap-2">
                        {(q.options ?? []).map((o) => (
                          <button
                            key={o}
                            onClick={() => setAnswers((p) => ({ ...p, [q.id]: o }))}
                            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                              answers[q.id] === o
                                ? "scale-[1.02] border-accent/50 bg-accent/15 text-white shadow-[0_0_12px_rgba(229,72,77,0.15)]"
                                : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    {q.type === "color" && (
                      <div className="flex flex-wrap gap-2.5">
                        {(q.options ?? []).map((c) => (
                          <button
                            key={c}
                            onClick={() => setAnswers((p) => ({ ...p, [q.id]: c }))}
                            title={c}
                            aria-label={`Color ${c}`}
                            className={`h-9 w-9 rounded-full border-2 transition-all duration-200 ${
                              answers[q.id] === c
                                ? "scale-110 border-white shadow-[0_0_16px_rgba(255,255,255,0.2)]"
                                : "border-white/20 hover:scale-105 hover:border-white/40"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                    {q.type === "style" && (
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {visibleSkills.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setAnswers((p) => ({ ...p, [q.id]: p[q.id] === s.id ? "" : s.id }))}
                            aria-pressed={answers[q.id] === s.id}
                            className={`overflow-hidden rounded-xl border-2 text-left transition-all duration-200 ${
                              answers[q.id] === s.id
                                ? "scale-[1.03] border-accent shadow-[0_0_24px_rgba(229,72,77,0.2)]"
                                : "border-white/[0.08] hover:border-white/25 hover:shadow-lg"
                            }`}
                            title={s.description || s.name}
                          >
                            {s.preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.preview} alt={s.name} className="h-20 w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="flex h-20 w-full items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent text-[11px] text-zinc-500">
                                {s.name}
                              </div>
                            )}
                            <p className={`truncate px-2.5 py-2 text-center text-[11px] font-semibold ${answers[q.id] === s.id ? "text-white" : "text-zinc-500"}`}>
                              {s.name}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => void startBuild()}
                  disabled={busy}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-hover px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(229,72,77,0.3)] transition-all duration-200 hover:shadow-[0_6px_24px_rgba(229,72,77,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                  Start building
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function userBubble(m: Msg, i: number) {
    return (
      <div
        key={i}
        className="flex justify-end animate-[fadeSlideUp_0.3s_ease-out_both]"
        style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-accent/90 to-accent px-4 py-3 shadow-[0_4px_16px_rgba(229,72,77,0.25)]">
          <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-white">{m.text}</p>
        </div>
      </div>
    );
  }

  function stepsCard() {
    if (steps.length === 0) return null;
    return (
      <div className="animate-[fadeSlideUp_0.3s_ease-out_both] rounded-2xl rounded-tl-md border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-3 backdrop-blur-md">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Build Progress</span>
        </div>
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 py-1 text-xs text-zinc-400 transition-colors"
            style={{
              opacity: i === steps.length - 1 ? 1 : 0.6,
            }}
          >
            {stepIcon(s.kind)}
            <span className="truncate">
              {s.text}
              {s.file && <span className="ml-1.5 font-mono text-[10px] text-zinc-600">{s.file}</span>}
            </span>
            {i === steps.length - 1 && busy && <Loader2 size={12} className="animate-spin text-accent" />}
          </div>
        ))}
      </div>
    );
  }

  /* ───────── Thinking indicator ───────── */
  function thinkingIndicator() {
    if (!busy) return null;
    return (
      <div className="flex gap-3 animate-[fadeSlideUp_0.2s_ease-out_both]">
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Human AI"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-white/[0.08]"
          />
          <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-[#0a0a0f] bg-amber-400" />
        </div>
        <div className="rounded-2xl rounded-tl-md border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] px-5 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.25)] backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-400" />
          </div>
        </div>
      </div>
    );
  }

  /* ───────── Input area ───────── */
  function inputArea(onSubmit: () => void, placeholder: string) {
    return (
      <div className="border-t border-white/[0.06] bg-[#0a0a0f]/80 p-4 backdrop-blur-lg">
        <div className="mx-auto max-w-3xl">
          {/* Quick Categories Bar right above input */}
          <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mr-1 shrink-0">
              Create:
            </span>
            {QUICK_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-red-500/40 hover:bg-white/[0.06] hover:text-white active:scale-95 shrink-0"
                >
                  <Icon size={13} className="text-red-400" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-300 focus-within:border-accent/30 focus-within:shadow-[0_8px_32px_rgba(229,72,77,0.08)]">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              rows={1}
              placeholder={placeholder}
              aria-label="Message"
              className="max-h-[200px] w-full resize-none bg-transparent px-4 pb-12 pt-4 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-400"
                  title="Attach file"
                >
                  <Plus size={16} />
                </button>
                <span className="font-mono text-[10px] tracking-wide text-zinc-700">humi.1.v-code</span>
              </div>
              <button
                onClick={onSubmit}
                disabled={busy || !draft.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-900 transition-all duration-200 hover:bg-zinc-200 hover:shadow-[0_2px_8px_rgba(255,255,255,0.1)] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                aria-label="Send"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ───────── Game Ideas Modal ───────── */
  function renderGameModal() {
    if (!showGameModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
        <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#101015] p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
                <Gamepad2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Browser Game Generator</h3>
                <p className="text-xs text-zinc-400">Pick an idea or refresh for more concepts</p>
              </div>
            </div>

            <button
              onClick={shuffleGameIdeas}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white active:rotate-180"
              title="Get new game ideas"
            >
              <RefreshCw size={13} className="text-red-400" />
              <span>Shuffle Ideas</span>
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {visibleGameIdeas.map((idea) => (
              <button
                key={idea.title}
                onClick={() => handleSelectGameIdea(idea)}
                className="group flex w-full flex-col text-left rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:-translate-y-0.5 hover:border-red-500/40 hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white group-hover:text-red-300">
                    {idea.title}
                  </span>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    {idea.genre}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{idea.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <button
              onClick={() => {
                setShowGameModal(false);
                setDraft("I want to build a custom browser game: ");
                if (textareaRef.current) textareaRef.current.focus();
              }}
              className="text-xs font-medium text-zinc-400 hover:text-white"
            >
              Write custom game idea &rarr;
            </button>
            <button
              onClick={() => setShowGameModal(false)}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.08] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════ */
  /*  Phase: idle / discuss — centered chat      */
  /* ═══════════════════════════════════════════ */

  if (phase !== "working") {
    return (
      <div className="relative flex h-full flex-col bg-[#0a0a0f]">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {bgOk && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/chat-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          )}
          {/* Gradient orbs */}
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[400px] rounded-full bg-violet-500/[0.03] blur-[100px]" />
          <div className="absolute right-0 top-0 h-[300px] w-[400px] rounded-full bg-sky-500/[0.03] blur-[100px]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Scrollable area */}
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-8">
            <div className="w-full max-w-2xl flex-1">
              {empty ? (
                /* ─── Welcome screen ─── */
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="flex flex-col items-center text-center animate-[fadeSlideUp_0.5s_ease-out_both]">
                    {/* Logo with glow */}
                    <div className="relative mb-8">
                      <div className="absolute inset-0 scale-150 rounded-full bg-accent/20 blur-2xl" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo.webp"
                        alt="Human AI logo"
                        width={64}
                        height={64}
                        className="relative h-16 w-16 rounded-2xl object-cover shadow-[0_8px_32px_rgba(229,72,77,0.3)] ring-1 ring-white/10"
                      />
                    </div>

                    {/* Greeting */}
                    <h1 className="text-balance bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                      {GREETING}
                    </h1>

                    {/* Subtitle */}
                    <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                      Describe your idea and I&apos;ll build it live.
                    </p>

                    {/* Suggestions */}
                    <div className="mt-8 flex flex-col gap-2.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => handleSuggestion(s.label)}
                          className={`group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-gradient-to-r ${s.color} px-4 py-3 text-left text-[13.5px] text-zinc-300 shadow-sm transition-all duration-200 hover:border-white/[0.12] hover:text-white hover:shadow-md`}
                        >
                          <s.icon size={16} className="shrink-0 text-zinc-500 transition-colors group-hover:text-zinc-300" />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* ─── Messages ─── */
                <div className="flex flex-col gap-4 pb-4">
                  {messages.map((m, i) =>
                    m.role === "user"
                      ? userBubble(m, i)
                      : assistantBubble(m, i, i === messages.length - 1 && questions.length > 0)
                  )}
                  {thinkingIndicator()}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          {inputArea(() => void discuss(), empty ? "Start chatting or describe a task…" : "Reply…")}
        </div>

        {/* Game Ideas Modal */}
        {renderGameModal()}

        {/* Error */}
        {error && (
          <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 animate-[fadeSlideUp_0.2s_ease-out_both]">
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm text-red-200 shadow-lg backdrop-blur-md">
              {error}
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════ */
  /*  Phase: working — chat left, IDE right      */
  /* ═══════════════════════════════════════════ */

  return (
    <div className="relative flex h-full bg-[#0a0a0f]">
      {/* ─── Left panel: Chat ─── */}
      <div className="flex w-full flex-col border-r border-white/[0.06] lg:w-[420px] xl:w-[480px]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#0c0c11]/80 px-4 py-3 backdrop-blur-md">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-accent/5">
            <Code2 size={14} className="text-accent" />
          </div>
          <p className="text-sm font-semibold text-white">humi.1.v-code</p>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            sandbox
          </span>
          <div className="flex-1" />
          {projectId && projUserId && projEmail && (
            <a
              href={`/build/${projUserId}/${encodeURIComponent(projEmail)}/${projectId}/`}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] text-emerald-400 transition-colors hover:bg-emerald-500/20"
              title="Open saved project page"
            >
              Project ↗
            </a>
          )}
        </div>

        {/* Messages */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 no-scrollbar">
          {messages.map((m, i) => (m.role === "user" ? userBubble(m, i) : assistantBubble(m, i, false)))}
          {stepsCard()}
          {thinkingIndicator()}
          {busy && !steps.length && messages.length > 0 && !busy && (
            <p className="text-xs text-zinc-600">Building…</p>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/[0.06] bg-[#0a0a0f]/80 p-3 backdrop-blur-md">
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent p-2.5 transition-colors focus-within:border-accent/25">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  followUp();
                }
              }}
              rows={2}
              placeholder="Describe a change — or just chat…"
              aria-label="Change request"
              className="max-h-[120px] w-full resize-none bg-transparent px-1 py-1 text-[13.5px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              onClick={followUp}
              disabled={busy || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-900 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
              aria-label="Send"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Right panel: Preview / Code ─── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#08080c]">
        {/* Tab bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0c0c11]/80 px-4 py-2.5 backdrop-blur-md">
          {/* Preview / Code toggle */}
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "code" && files.length > 0 && !activeFile) setActiveFile(files[0].path);
                }}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition-all duration-200 ${
                  tab === t
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mx-1 h-4 w-px bg-white/[0.06]" />

          <Eye size={13} className="text-zinc-600" />
          <span className="hidden font-mono text-[10px] text-zinc-600 sm:block">
            {previewUrl ? new URL(previewUrl).hostname : "waiting…"}
          </span>

          {skills.length > 0 && (
            <select
              value={answers["__style"] ?? ""}
              onChange={(e) => setAnswers((p) => ({ ...p, __style: e.target.value }))}
              className="rounded-lg border border-white/[0.08] bg-[#0a0a0f] px-2 py-1 text-[11px] text-zinc-400 focus:outline-none"
              title="Design skill"
            >
              <option value="" className="bg-[#0a0a0f]">Default</option>
              {visibleSkills.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#0a0a0f]">🎨 {s.name}</option>
              ))}
            </select>
          )}

          <div className="flex-1" />

          {/* File tabs (code view) */}
          {tab === "code" &&
            files.map((f) => (
              <button
                key={f.path}
                onClick={() => setActiveFile(f.path)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition-all duration-200 ${
                  f.path === activeFile
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
                title={changedPaths.includes(f.path) ? "Changed" : f.path}
              >
                {changedPaths.includes(f.path) && <FileDiff size={11} className="text-accent" />}
                {f.path}
              </button>
            ))}

          {previewUrl && tab === "preview" && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-white"
              title="Open in new tab"
            >
              <ExternalLink size={13} />
            </a>
          )}

          {sandboxId && (
            <a
              href={`/api/build/download?sandboxId=${encodeURIComponent(sandboxId)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-400 transition-all hover:border-white/20 hover:text-white"
              title="Download"
            >
              <Download size={12} />
              .tar.gz
            </a>
          )}

          {/* Publish */}
          {files.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-zinc-400">
              <Rocket size={12} className="text-accent" />
              <input
                value={sub}
                onChange={(e) => {
                  setSub(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40));
                  setPubMsg(null);
                }}
                placeholder="name"
                className="w-16 bg-transparent font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-700"
                title="Subdomain"
              />
              <span className="hidden font-mono text-[10px] text-zinc-700 xl:inline">.usehuman.de</span>
              <button
                disabled={publishing || sub.length < 3}
                onClick={async () => {
                  setPublishing(true);
                  setPubMsg(null);
                  try {
                    const res = await fetch("/api/build/deploy", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        subdomain: sub,
                        files: files.map((f) => ({ path: f.path, content: f.content })),
                      }),
                    });
                    const raw = await res.text().catch(() => "");
                    let j: { url?: string; error?: string; vercel?: { verified?: boolean; txt?: string | null; note?: string | null } } | null = null;
                    try {
                      j = JSON.parse(raw) as { url?: string; error?: string; vercel?: { verified?: boolean; txt?: string | null; note?: string | null } };
                    } catch {
                      j = null;
                    }
                    if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}: ${raw.slice(0, 200) || "empty response"}`);
                    if (!j?.url) throw new Error("Bad response from server.");
                    setPubUrl(j.url);
                    if (j.vercel && !j.vercel.verified && j.vercel.txt) {
                      setPubMsg(`Saved — add TXT in Cloudflare: ${j.vercel.txt}`);
                    } else if (j.vercel && !j.vercel.verified && j.vercel.note) {
                      setPubMsg(`Saved — Vercel: ${j.vercel.note}`);
                    } else {
                      setPubMsg(`Live: ${j.url}`);
                    }
                  } catch (e) {
                    setPubUrl("");
                    setPubMsg(e instanceof Error ? e.message : "Publish failed.");
                  } finally {
                    setPublishing(false);
                  }
                }}
                className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white transition-all hover:bg-accent-hover disabled:opacity-40"
                title="Publish"
              >
                {publishing ? "…" : "Publish"}
              </button>
            </span>
          )}

          {pubUrl && (
            <a
              href={pubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-36 truncate font-mono text-[11px] text-emerald-400 underline-offset-2 hover:underline"
              title={pubUrl}
            >
              {pubUrl.replace("https://", "")}
            </a>
          )}
          {pubMsg && !pubUrl && (
            <span className="font-mono text-[11px] text-red-400">{pubMsg}</span>
          )}
        </div>

        {/* Preview / Code content */}
        <div className="flex min-h-0 flex-1">
          {tab === "preview" ? (
            previewUrl ? (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="Site preview"
                className="min-w-0 flex-1 bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-8 text-center">
                <div className="animate-[fadeSlideUp_0.5s_ease-out_both]">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
                    <Eye size={20} className="text-zinc-600" />
                  </div>
                  <p className="max-w-xs text-sm leading-relaxed text-zinc-600">
                    Your website appears here — real files, rendered in an isolated sandbox.
                  </p>
                </div>
              </div>
            )
          ) : active ? (
            <pre className="min-w-0 flex-1 overflow-auto p-5 font-mono text-[12px] leading-7 text-zinc-300">
              {active.content}
            </pre>
          ) : (
            <div className="flex flex-1 items-center justify-center px-8 text-center">
              <div className="animate-[fadeSlideUp_0.5s_ease-out_both]">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04]">
                  <Code2 size={20} className="text-zinc-600" />
                </div>
                <p className="max-w-xs text-sm leading-relaxed text-zinc-600">Code appears here after the first build.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game Ideas Modal */}
      {renderGameModal()}

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 animate-[fadeSlideUp_0.2s_ease-out_both]">
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm text-red-200 shadow-lg backdrop-blur-md">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

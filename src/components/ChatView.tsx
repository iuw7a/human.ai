"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ThumbsUp, ThumbsDown, Globe, MoreHorizontal, Plug, Wrench, X, Bot, Monitor, Square, AlertTriangle, ChevronDown } from "lucide-react";
import { ChatInput, type PendingImage } from "./ChatInput";
import { Markdown } from "./Markdown";
import { AvatarMark } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { getModel } from "@/lib/models";
import type { ChatMode } from "./ModeSelector";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface StoredMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  images?: { url: string; storagePath?: string }[];
}

function VoteButtons({ chatId, modelId, excerpt }: { chatId: string; modelId: string; excerpt: string }) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  async function vote(rating: "up" | "down") {
    setVoted(rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, model: modelId, rating, excerpt: excerpt.slice(0, 500) }),
      });
    } catch {
      // feedback is optional
    }
  }
  const cls = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-ink-800 ${
      active ? "text-accent" : "text-zinc-500 hover:text-zinc-200"
    }`;
  return (
    <>
      <button onClick={() => vote("up")} className={cls(voted === "up")} aria-label="Good answer" title="Good answer">
        <ThumbsUp size={14} />
      </button>
      <button onClick={() => vote("down")} className={cls(voted === "down")} aria-label="Bad answer" title="Bad answer">
        <ThumbsDown size={14} />
      </button>
    </>
  );
}

interface ActiveAd {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  destination_url: string;
}

function AdCard({ ad, onDismiss }: { ad: ActiveAd; onDismiss: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  let host = "";
  try {
    host = new URL(ad.destination_url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const TitleTag = ad.destination_url ? "a" : "span";
  return (
    <article className="animate-ad-in group mt-4 flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-ink-900/80 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-colors duration-200 hover:border-white/[0.18] sm:gap-2.5 sm:p-2">
      {ad.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.image_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-white/10 object-cover sm:h-12 sm:w-16"
        />
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-2">
          <Globe size={13} className="shrink-0 text-zinc-500" />
          <span className="truncate text-xs text-zinc-400">{host || ad.title}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
              Ad
            </span>
            <span className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Ad options"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <MoreHorizontal size={15} />
              </button>
              {menuOpen && (
                <>
                  <span className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <span className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-white/10 bg-ink-800 py-1 shadow-2xl">
                    <button
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(ad.destination_url);
                        } catch {
                          // ignore
                        }
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/[0.06]"
                    >
                      Copy link
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDismiss();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/[0.06]"
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </span>
                </>
              )}
            </span>
          </span>
        </div>
        <TitleTag
          {...(ad.destination_url
            ? { href: ad.destination_url, target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className={`mt-1 block truncate text-sm font-semibold leading-6 text-zinc-50 ${
            ad.destination_url ? "transition-colors hover:text-white hover:underline hover:underline-offset-4 hover:decoration-zinc-600" : ""
          }`}
        >
          {ad.title}
        </TitleTag>
        {ad.description && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-zinc-400">
            {ad.description}
          </p>
        )}
      </div>
    </article>
  );
}

interface UploadedImage {
  url: string;
  storagePath?: string;
  mimeType: string;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable
        }
      }}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-ink-800 hover:text-zinc-200"
      aria-label="Copy answer"
      title="Copy"
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

interface ActivityStep {
  n: number;
  status: string;
  message?: string;
}

interface ModeActivity {
  kind: "agent" | "computer";
  status: string;
  steps: ActivityStep[];
  shot: string | null;
  approval: { action: string; reason: string } | null;
  doneText: string | null;
  stopped: boolean;
}

function validMode(m: unknown): m is ChatMode {
  return m === "chat" || m === "agent" || m === "computer-use";
}

/** Inline progress for Agent / Computer Use runs — same chat UI, no separate interface. */
function ModeActivityCard({
  activity,
  onApprove,
  onReject,
  onStop,
  onRelease,
  onDismiss,
}: {
  activity: ModeActivity;
  onApprove: () => void;
  onReject: () => void;
  onStop: () => void;
  onRelease: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const running = !activity.doneText;
  const Icon = activity.kind === "computer" ? Monitor : Bot;
  const label = activity.kind === "computer" ? "Computer Use" : "Agent";
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/80">
      <div className="flex items-center gap-2.5 px-4 py-3">
        {running ? (
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
        ) : (
          <span className={`h-2 w-2 shrink-0 rounded-full ${activity.stopped ? "bg-zinc-500" : "bg-emerald-400"}`} />
        )}
        <Icon size={15} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
          {label} · {running ? activity.status : activity.doneText}
        </span>
        {activity.steps.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-ink-800 hover:text-white"
          >
            {activity.steps.length} steps
            <ChevronDown size={13} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        {running ? (
          <button
            onClick={onStop}
            title={activity.kind === "computer" ? "Immediately release mouse and keyboard" : "Stop the agent"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <Square size={11} /> Stop
          </button>
        ) : (
          <button
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-ink-800 hover:text-white"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {activity.approval && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 animate-menu-in">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-200">
            <AlertTriangle size={14} /> Human approval required
          </p>
          <p className="mt-1 text-[13px] text-zinc-200">{activity.approval.action}</p>
          {activity.approval.reason && (
            <p className="mt-0.5 text-xs text-zinc-400">{activity.approval.reason}</p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button onClick={onApprove} className="btn-primary flex-1 !py-1.5 text-[13px]">
              <Check size={14} /> Approve
            </button>
            <button onClick={onReject} className="btn-ghost flex-1 border border-ink-600 !py-1.5 text-[13px]">
              <X size={14} /> Reject
            </button>
          </div>
        </div>
      )}

      {expanded && activity.steps.length > 0 && (
        <div className="mx-4 mb-3 max-h-48 space-y-1.5 overflow-y-auto">
          {activity.steps.map((s, i) => (
            <div key={i} className="rounded-lg bg-black/40 px-3 py-1.5">
              <p className="text-xs font-medium text-zinc-200">
                <span className="mr-2 font-mono text-[10px] text-zinc-500">#{s.n}</span>
                {s.status}
              </p>
              {s.message && <p className="mt-0.5 text-xs leading-5 text-zinc-500">{s.message}</p>}
            </div>
          ))}
        </div>
      )}

      {activity.shot && (
        <div className="px-4 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${activity.shot}`}
            alt="Current view"
            className="max-h-56 w-full rounded-xl border border-ink-700 object-cover object-top"
          />
        </div>
      )}

      {!running && activity.kind === "computer" && !activity.stopped && (
        <div className="border-t border-ink-800 px-4 py-2.5">
          <button
            onClick={onRelease}
            className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-200 hover:underline"
          >
            Release the computer (close session)
          </button>
        </div>
      )}
    </div>
  );
}

export function ChatView({
  chatId,
  modelId,
  user,
  initialMessages,
  pendingKey,
}: {
  chatId: string;
  modelId: string;
  user: SupabaseUser | null;
  initialMessages: StoredMessage[];
  pendingKey?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booted, setBooted] = useState(!pendingKey);
  const [bgOk, setBgOk] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);
  const [mcpServers, setMcpServers] = useState<{ id: string; name: string }[]>([]);
  const [mcpUsed, setMcpUsed] = useState<{ server: string; tool: string }[]>([]);
  // ONE conversation, three execution modes. Mode only changes HOW a message is handled.
  const [mode, setMode] = useState<ChatMode>("chat");
  const modeRef = useRef<ChatMode>("chat");
  const [activity, setActivity] = useState<ModeActivity | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const stopRef = useRef(false);
  const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  function changeMode(m: ChatMode) {
    modeRef.current = m;
    setMode(m);
  }

  const model = getModel(modelId);
  const title =
    messages.find((m) => m.role === "user")?.content.slice(0, 40) || "Human AI";

  // Only render the background image after it provably loaded.
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

  // Public feature flags + active ad (DB-backed, never hardcoded).
  // Plus the user's connected MCP servers (for the status chips).
  useEffect(() => {
    fetch("/api/public/flags")
      .then((r) => r.json())
      .then((j) => {
        const f = (j.flags ?? {}) as Record<string, boolean>;
        setFlags(f);
        if (f.ads !== false) {
          fetch("/api/ads/active")
            .then((r) => r.json())
            .then((a) => setAd(a.ad ?? null))
            .catch(() => {});
        }
      })
      .catch(() => {});
    if (user) {
      fetch("/api/mcp/connections")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const list = (j?.connections ?? []) as { server_id: string; server?: { name?: string } }[];
          setMcpServers(
            list.map((c) => ({ id: c.server_id, name: c.server?.name ?? c.server_id }))
          );
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamed, activity]);

  async function persist(
    role: "user" | "assistant",
    content: string,
    images?: { url: string; storagePath?: string }[]
  ) {
    if (!user) return;
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("chats")
      .select("title")
      .eq("id", chatId)
      .maybeSingle();
    const needsTitle =
      !existing?.title ||
      existing.title === "New Chat" ||
      existing.title === "New conversation";
    await supabase.from("chats").upsert(
      {
        id: chatId,
        user_id: user.id,
        model_id: modelId,
        title:
          role === "user" && needsTitle
            ? content.slice(0, 80) || "New conversation"
            : (existing?.title ?? "New Chat"),
      },
      { onConflict: "id" }
    );
    await supabase.from("messages").insert({
      chat_id: chatId,
      user_id: user.id,
      role,
      content,
      images: (images ?? []).map((i) => ({
        url: i.url.startsWith("data:") ? "" : i.url,
        storagePath: i.storagePath ?? null,
      })),
    });
    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  }

  async function uploadImages(images: PendingImage[]): Promise<UploadedImage[]> {
    if (images.length === 0) return [];
    if (!user) {
      return images.map((i) => ({ url: i.dataUrl, mimeType: i.mimeType }));
    }
    const form = new FormData();
    for (const img of images) {
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      form.append("files", blob, img.name || "image.png");
    }
    form.append("chatId", chatId);
    try {
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (up.ok) {
        const json = (await up.json()) as {
          files: { path: string; url: string | null; mimeType: string }[];
        };
        return images.map((img, i) => ({
          url: img.dataUrl,
          storagePath: json.files?.[i]?.path,
          mimeType: img.mimeType,
        }));
      }
    } catch {
      // storage optional — chat still works with inline images
    }
    return images.map((i) => ({ url: i.dataUrl, mimeType: i.mimeType }));
  }

  /** Shared first half of every send: upload, append + persist the user message. */
  async function prepareUserMessage(
    text: string,
    pendingImages: PendingImage[]
  ): Promise<{ history: StoredMessage[]; uploaded: UploadedImage[] }> {
    const uploaded = await uploadImages(pendingImages);
    const userMsg: StoredMessage = {
      role: "user",
      content: text,
      images: uploaded,
    };
    const history = [...messages, userMsg];
    setMessages(history);
    await persist(
      "user",
      text,
      uploaded.map((u) => ({ url: u.storagePath ?? "", storagePath: u.storagePath }))
    );
    router.refresh();
    return { history, uploaded };
  }

  async function send(text: string, pendingImages: PendingImage[], modeOverride?: ChatMode) {
    if (sendingRef.current) return;
    if (!model) {
      setError(`Unknown model "${modelId}".`);
      return;
    }
    const m = modeOverride ?? modeRef.current;
    sendingRef.current = true;
    setSending(true);
    setStreamed("");
    setError(null);
    setMcpUsed([]);

    try {
      const { history, uploaded } = await prepareUserMessage(text, pendingImages);
      if (m === "agent") {
        await runAgentTask(history, text, uploaded.length);
      } else if (m === "computer-use") {
        await runComputerTask(history, text, uploaded.length);
      } else {
        await runChatReply(history);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStreamed("");
      setActivity(null);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  /** Normal chat reply: existing streaming behavior, unchanged. */
  async function runChatReply(history: StoredMessage[]) {
    const apiMessages = history.map((m) => ({
      role: m.role,
      content: m.content,
      images: (m.images ?? [])
        .filter((i) => i.url.startsWith("data:") || i.url.startsWith("http"))
        .map((i) => ({ url: i.url })),
    }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, messages: apiMessages }),
    });
    if (!res.ok || !res.body) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error ?? `Request failed (${res.status}).`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
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
        try {
          const json = JSON.parse(data) as {
            token?: string;
            error?: string;
            mcp_used?: { server: string; tool: string }[];
          };
          if (json.error) throw new Error(json.error);
          if (json.mcp_used) setMcpUsed((prev) => [...prev, ...json.mcp_used!]);
          if (json.token) {
            full += json.token;
            setStreamed(full);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }

    await finishAssistantReply(history, full);
  }

  async function finishAssistantReply(history: StoredMessage[], full: string) {
    setMessages([...history, { role: "assistant", content: full }]);
    setStreamed("");
    await persist("assistant", full);
    router.refresh();
  }

  /** Conversation context so follow-up tasks reuse what was already discussed/done. */
  function convoContext(history: StoredMessage[]): string {
    return history
      .slice(-6)
      .map((m) => `${m.role === "assistant" ? "Human AI" : "User"}: ${m.content.slice(0, 600)}`)
      .join("\n");
  }

  function waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
    });
  }

  function decideApproval(approved: boolean) {
    const r = approvalResolveRef.current;
    approvalResolveRef.current = null;
    setActivity((a) => (a ? { ...a, approval: null, status: approved ? "Approved — continuing…" : "Rejected — replanning…" } : a));
    r?.(approved);
  }

  function stopRun() {
    stopRef.current = true;
    const r = approvalResolveRef.current;
    approvalResolveRef.current = null;
    r?.(false);
  }

  /**
   * Generic in-chat task driver for Agent (isolated browser) and Computer Use (real desktop).
   * The session is bound to this chatId, so follow-up messages continue the same
   * browser/desktop state instead of starting over. The result lands in this chat.
   */
  async function driveModeTask(
    kind: "agent" | "computer",
    history: StoredMessage[],
    text: string,
    imageCount: number
  ) {
    const isComputer = kind === "computer";
    const sessionUrl = isComputer ? "/api/agent-desktop/session" : "/api/agent/session";
    const stepUrl = isComputer ? "/api/agent-desktop/step" : "/api/agent/step";
    const approveUrl = isComputer ? "/api/agent-desktop/approve" : "/api/agent/approve";
    stopRef.current = false;
    sessionIdRef.current = null;
    let stepNo = 0;

    setActivity({
      kind,
      status: isComputer ? "Looking at screen…" : "Starting browser task…",
      steps: [],
      shot: null,
      approval: null,
      doneText: null,
      stopped: false,
    });

    const goal =
      `TASK: ${text}` +
      (imageCount > 0 ? ` [${imageCount} image(s) attached in chat]` : "") +
      `\n\nCONVERSATION SO FAR (same chat — use it for context, and continue any ongoing on-screen work):\n${convoContext(history)}`;

    // Create or resume the chat-bound session (server retargets when one is live).
    const createRes = await fetch(sessionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isComputer ? { goal, consent: true, chatId } : { goal, chatId }
      ),
    });
    const created = await createRes.json().catch(() => null);
    if (!createRes.ok) throw new Error(created?.error ?? `Could not start ${isComputer ? "Computer Use" : "Agent"} session.`);
    const sessionId = created.sessionId as string;
    sessionIdRef.current = sessionId;
    if (created.screenshot) {
      setActivity((a) => (a ? { ...a, shot: created.screenshot } : a));
    }

    for (let i = 0; i < 40; i++) {
      if (stopRef.current) break;
      const res = await fetch(stepUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Step failed (${res.status}).`);
      if (j.screenshot) {
        const shot = j.screenshot as string;
        setActivity((a) => (a ? { ...a, shot } : a));
      }
      if (j.stopped) {
        await finishModeTask(history, kind, j.message ?? "Stopped.", true);
        return;
      }
      if (j.needsApproval) {
        setActivity((a) =>
          a
            ? {
                ...a,
                approval: {
                  action: String(j.needsApproval.action ?? "sensitive action"),
                  reason: String(j.needsApproval.reason ?? ""),
                },
                status: "Human approval required",
              }
            : a
        );
        const approved = await waitForApproval();
        if (stopRef.current) break;
        const ar = await fetch(approveUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, approved }),
        });
        const aj = await ar.json().catch(() => null);
        if (!ar.ok) throw new Error(aj?.error ?? "Approval failed.");
        if (aj.screenshot) {
          setActivity((a) => (a ? { ...a, shot: aj.screenshot } : a));
        }
        setActivity((a) =>
          a
            ? {
                ...a,
                steps: [...a.steps, { n: ++stepNo, status: approved ? "Approved" : "Rejected", message: aj.message }].slice(-30),
                status: approved ? "Continuing…" : "Replanning…",
              }
            : a
        );
        continue;
      }
      if (j.done) {
        await finishModeTask(history, kind, j.message ?? "Task completed.", false);
        return;
      }
      const status = String(j.status ?? j.action ?? "Working…");
      const observation = j.observation ? String(j.observation).slice(0, 300) : undefined;
      setActivity((a) =>
        a
          ? {
              ...a,
              status,
              steps: [...a.steps, { n: ++stepNo, status, message: observation }].slice(-30),
            }
          : a
      );
    }

    if (stopRef.current) {
      if (isComputer && sessionIdRef.current) {
        // Emergency release: immediately free mouse/keyboard and remove the overlay.
        await fetch(`/api/agent-desktop/session?id=${sessionIdRef.current}`, { method: "DELETE" }).catch(() => {});
        sessionIdRef.current = null;
      }
      await finishModeTask(history, kind, "Stopped by user.", true);
      return;
    }
    await finishModeTask(history, kind, "Stopped: step limit reached.", true);
  }

  async function finishModeTask(
    history: StoredMessage[],
    kind: "agent" | "computer",
    message: string,
    stopped: boolean
  ) {
    const label = kind === "computer" ? "Computer Use" : "Agent";
    const full = message && message.trim() ? message : "Task completed.";
    setActivity((a) =>
      a ? { ...a, doneText: `${label}: ${full.slice(0, 300)}`, stopped, status: stopped ? "Stopped" : "Task completed", approval: null } : a
    );
    await finishAssistantReply(history, full);
  }

  /** Agent mode: always performs the task in the isolated browser, in this chat. */
  async function runAgentTask(history: StoredMessage[], text: string, imageCount: number) {
    await driveModeTask("agent", history, text, imageCount);
  }

  /**
   * Computer Use mode: acts like an ongoing participant in this chat.
   * Plain questions are answered normally; anything needing the screen
   * immediately drives the persistent computer session bound to this chat.
   */
  async function runComputerTask(history: StoredMessage[], text: string, imageCount: number) {
    setActivity({
      kind: "computer",
      status: "Thinking…",
      steps: [],
      shot: null,
      approval: null,
      doneText: null,
      stopped: false,
    });
    let needsComputer = true;
    try {
      const cr = await fetch("/api/computer-use/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 500) })),
        }),
      });
      const cj = await cr.json().catch(() => null);
      if (cr.ok && cj && cj.needsComputer === false) needsComputer = false;
    } catch {
      needsComputer = true;
    }
    if (!needsComputer) {
      setActivity(null);
      await runChatReply(history);
      return;
    }
    await driveModeTask("computer", history, text, imageCount);
  }

  /** Release the chat's computer session (frees mouse/keyboard, removes overlay). */
  async function releaseComputer() {
    try {
      const res = await fetch(`/api/agent-desktop/session?chatId=${encodeURIComponent(chatId)}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j?.sessionId) {
        await fetch(`/api/agent-desktop/session?id=${j.sessionId}`, { method: "DELETE" }).catch(() => {});
      }
    } catch {
      // best effort
    }
    sessionIdRef.current = null;
    setActivity(null);
  }

  useEffect(() => {
    if (booted || !pendingKey) return;
    setBooted(true);
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (raw) {
        sessionStorage.removeItem(pendingKey);
        const pending = JSON.parse(raw) as {
          text: string;
          images: PendingImage[];
          mode?: unknown;
        };
        if (pending.text || pending.images?.length) {
          // Carry the entry-point mode into this same conversation (no new chat).
          const m = validMode(pending.mode) ? pending.mode : "chat";
          changeMode(m);
          void send(pending.text ?? "", pending.images ?? [], m);
        }
      }
    } catch {
      // no pending message — show empty state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, pendingKey]);

  if (!model) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-xl font-semibold text-white">Unknown model</h1>
        <p className="mt-2 text-sm text-zinc-400">
          The model “{modelId}” is not available on Human AI.
        </p>
      </div>
    );
  }

  const empty = messages.length === 0 && !streamed && !sending;

  return (
    <div className="relative flex h-full flex-col bg-black">
      {/* Chat background at 100% — the image IS the backdrop. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/chat-bg.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <p className="max-w-[60%] truncate pl-10 text-sm font-medium text-zinc-200 lg:pl-0">
          {title}
        </p>
        {!user && (
          <a href="/login" className="text-xs text-zinc-400 hover:text-white">
            Log in to save chats
          </a>
        )}
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {empty ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.webp"
                alt="Human AI"
                className="mb-6 h-20 w-20 rounded-3xl object-cover shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              />
              <h1 className="text-5xl font-black tracking-[0.24em] text-white sm:text-6xl">
                HUMAN AI
              </h1>
              <p className="mt-3 text-[15px] text-zinc-400">
                Ask anything. Attach an image to analyze it.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div key={i}>
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink-800 px-4 py-2.5 ring-1 ring-ink-700">
                        {m.images && m.images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {m.images.map((img, j) =>
                              img.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={j}
                                  src={img.url}
                                  alt={`Attachment ${j + 1}`}
                                  className="h-32 w-32 rounded-xl border border-ink-600 object-cover"
                                />
                              ) : null
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                          {m.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <AvatarMark size={28} />
                      <div className="min-w-0 flex-1">
                        <Markdown content={m.content} />
                        <div className="mt-2 flex items-center gap-1">
                          <CopyButton text={m.content} />
                          {flags.feedback !== false && user && (
                            <VoteButtons chatId={chatId} modelId={modelId} excerpt={m.content} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {(sending || streamed) && (
                <div className="flex gap-3">
                  <AvatarMark size={28} />
                  <div className="min-w-0 flex-1">
                    {streamed ? (
                      <Markdown content={streamed} />
                    ) : (
                      <div className="flex items-center gap-2 py-2" aria-label="Thinking">
                        <span className="flex items-center gap-1.5">
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-500" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-500" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-zinc-500" />
                        </span>
                        <span className="text-sm text-zinc-400">Thinking…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {activity && (
            <ModeActivityCard
              activity={activity}
              onApprove={() => decideApproval(true)}
              onReject={() => decideApproval(false)}
              onStop={stopRun}
              onRelease={releaseComputer}
              onDismiss={() => setActivity(null)}
            />
          )}
          {ad && !adDismissed && messages.length > 0 && (
            <AdCard ad={ad} onDismiss={() => setAdDismissed(true)} />
          )}
          {mcpUsed.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Wrench size={13} className="text-zinc-500" />
              {mcpUsed.map((u, i) => (
                <span
                  key={i}
                  className="rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 font-mono text-[11px] text-zinc-300"
                >
                  {u.server} · {u.tool}
                </span>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2 sm:px-6">
          {mcpServers.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
              {mcpServers.map((s) => (
                <a
                  key={s.id}
                  href={`/mcp/${s.id}`}
                  title={`${s.name} connected — manage`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  <Plug size={11} /> {s.name}
                </a>
              ))}
              <a href="/mcp" title="Browse MCP Marketplace" className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline">
                + Add
              </a>
            </div>
          )}
          <ChatInput
            onSend={send}
            sending={sending}
            allowUpload={flags.image_generation !== false}
            mode={mode}
            onModeChange={changeMode}
            placeholder={
              mode === "agent"
                ? "Describe the task, e.g. Research this company and summarize it…"
                : mode === "computer-use"
                  ? "Describe what to do on the computer, e.g. Open ChatGPT…"
                  : "Ask Human AI anything..."
            }
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ThumbsUp, ThumbsDown, Globe, MoreHorizontal, X } from "lucide-react";
import { ChatInput, type PendingImage } from "./ChatInput";
import { Markdown } from "./Markdown";
import { AvatarMark } from "./Logo";
import { createClient } from "@/lib/supabase/client";
import { getModel } from "@/lib/models";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

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
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamed]);

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

  async function send(text: string, pendingImages: PendingImage[]) {
    if (sendingRef.current) return;
    if (!model) {
      setError(`Unknown model "${modelId}".`);
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setStreamed("");
    setError(null);

    try {
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
            const json = JSON.parse(data) as { token?: string; error?: string };
            if (json.error) throw new Error(json.error);
            if (json.token) {
              full += json.token;
              setStreamed(full);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      setMessages([...history, { role: "assistant", content: full }]);
      setStreamed("");
      await persist("assistant", full);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStreamed("");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
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
        };
        if (pending.text || pending.images?.length) {
          void send(pending.text ?? "", pending.images ?? []);
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
          {ad && !adDismissed && messages.length > 0 && (
            <AdCard ad={ad} onDismiss={() => setAdDismissed(true)} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="relative z-10">
        <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2 sm:px-6">
          <ChatInput onSend={send} sending={sending} allowUpload={flags.image_generation !== false} />
        </div>
      </div>
    </div>
  );
}

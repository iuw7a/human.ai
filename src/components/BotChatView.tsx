"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Wrench, Plus, ArrowLeft, Plug } from "lucide-react";
import { ChatInput, type PendingImage } from "./ChatInput";
import { Markdown } from "./Markdown";
import { BotAvatar } from "./BotAvatar";
import { createClient } from "@/lib/supabase/client";
import type { Bot } from "@/lib/bots";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface BotStoredMessage {
  role: "user" | "assistant";
  content: string;
  images?: { url: string; storagePath?: string }[];
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
          // ignore
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

export function BotChatView({
  bot,
  user,
  conversationId,
  initialMessages,
}: {
  bot: Bot;
  user: SupabaseUser | null;
  conversationId: string;
  initialMessages: BotStoredMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<BotStoredMessage[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mcpUsed, setMcpUsed] = useState<{ server: string; tool: string }[]>([]);
  const [bgOk, setBgOk] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamed]);

  async function uploadImages(images: PendingImage[]): Promise<UploadedImage[]> {
    if (images.length === 0) return [];
    if (!user) return images.map((i) => ({ url: i.dataUrl, mimeType: i.mimeType }));
    const form = new FormData();
    for (const img of images) {
      const res = await fetch(img.dataUrl);
      const blob = await res.blob();
      form.append("files", blob, img.name || "image.png");
    }
    form.append("chatId", conversationId);
    try {
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (up.ok) {
        const json = (await up.json()) as { files: { path: string; url: string | null; mimeType: string }[] };
        return images.map((img, i) => ({
          url: img.dataUrl,
          storagePath: json.files?.[i]?.path,
          mimeType: img.mimeType,
        }));
      }
    } catch {
      // storage optional
    }
    return images.map((i) => ({ url: i.dataUrl, mimeType: i.mimeType }));
  }

  async function persistUser(content: string, images: { url: string; storagePath?: string }[]) {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("bot_messages").insert({
      conversation_id: conversationId,
      bot_id: bot.id,
      user_id: user.id,
      role: "user",
      content,
      images: images.map((i) => ({
        url: i.url.startsWith("data:") ? "" : i.url,
        storagePath: i.storagePath ?? null,
      })),
    });
    await supabase.from("bot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  async function send(text: string, pendingImages: PendingImage[]) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setStreamed("");
    setError(null);
    setMcpUsed([]);
    try {
      const uploaded = await uploadImages(pendingImages);
      const userMsg: BotStoredMessage = { role: "user", content: text, images: uploaded };
      const history = [...messages, userMsg];
      setMessages(history);
      await persistUser(
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

      const res = await fetch(`/api/bots/${bot.slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, messages: apiMessages }),
      });
      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => null);
        const msg = errJson?.error ?? `Request failed (${res.status}).`;
        throw new Error(errJson?.upgrade ? `${msg} (Pro required)` : msg);
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
      // Assistant reply is persisted server-side; just append locally.
      setMessages([...history, { role: "assistant", content: full }]);
      setStreamed("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStreamed("");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function newChat() {
    const res = await fetch(`/api/bots/${bot.slug}/conversations`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.id) router.push(`/bot/${bot.slug}/chat?c=${j.id}`);
  }

  const empty = messages.length === 0 && !streamed && !sending;

  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/chat-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 pl-10 lg:pl-0">
          <BotAvatar src={bot.avatar_url} name={bot.name} size={30} accent={bot.theme.accent} state={sending ? "thinking" : "idle"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{bot.name}</p>
            <p className="truncate font-mono text-[11px] text-zinc-500">/bot/{bot.slug}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/bot/${bot.slug}`} className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white" title="Bot profile">
            <ArrowLeft size={16} />
          </Link>
          <button onClick={newChat} className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white" title="New conversation">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {empty ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
              <BotAvatar src={bot.avatar_url} name={bot.name} size={80} accent={bot.theme.accent} />
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">{bot.name}</h1>
              <p className="mt-2 max-w-md text-[15px] text-zinc-400">
                {bot.description || "Talk to your companion."}
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
                                <img key={j} src={img.url} alt={`Attachment ${j + 1}`} className="h-32 w-32 rounded-xl border border-ink-600 object-cover" />
                              ) : null
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <BotAvatar src={bot.avatar_url} name={bot.name} size={28} accent={bot.theme.accent} />
                      <div className="min-w-0 flex-1">
                        <Markdown content={m.content} />
                        <div className="mt-2 flex items-center gap-1">
                          <CopyButton text={m.content} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {(sending || streamed) && (
                <div className="flex gap-3">
                  <BotAvatar src={bot.avatar_url} name={bot.name} size={28} accent={bot.theme.accent} state="thinking" />
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
                        <span className="text-sm text-zinc-400">{bot.name} is thinking…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-red-200">{error}</div>
          )}
          {mcpUsed.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {mcpUsed.map((u, i) => (
                <span key={i} className="rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 font-mono text-[11px] text-zinc-300">
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
          <div className="mb-2 flex items-center justify-center">
            <a href="/bots" className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 text-[11px] text-zinc-400 hover:text-white">
              <Plug size={11} /> My Bots
            </a>
          </div>
          <ChatInput onSend={send} sending={sending} showModeSelector={false} placeholder={`Message ${bot.name}…`} />
        </div>
      </div>
    </div>
  );
}

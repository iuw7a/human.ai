"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowLeft, Plug } from "lucide-react";
import type { PendingImage } from "./ChatInput";
import { createClient } from "@/lib/supabase/client";
import type { Bot } from "@/lib/bots";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { DynamicIsland } from "./ai/DynamicIsland";
import { BotAvatar, type BotAvatarState } from "./BotAvatar";
import { Composer } from "./ai/Composer";
import { UserMessage, AssistantMessage, ThinkingRow, type SpeakState } from "./ai/Message";
import { MessageList } from "./ai/MessageList";
import { TaskPanel } from "./ai/TaskCard";
import { useVoice } from "./ai/useVoice";
import type { AIStatus } from "./ai/types";

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
  const sendingRef = useRef(false);
  const [voiceText, setVoiceText] = useState("");
  const voice = useVoice({ onTranscript: (t) => setVoiceText((prev) => (prev ? `${prev} ${t}` : t)) });
  const [completedFlash, setCompletedFlash] = useState(false);
  const prevSendingRef = useRef(false);

  useEffect(() => {
    if (prevSendingRef.current && !sending) {
      setCompletedFlash(true);
      const t = setTimeout(() => setCompletedFlash(false), 2500);
      prevSendingRef.current = false;
      return () => clearTimeout(t);
    }
    prevSendingRef.current = sending;
  }, [sending]);

  const botStatus: AIStatus = voice.listening
    ? "listening"
    : voice.speaking
      ? "speaking"
      : sending
        ? streamed
          ? "generating"
          : mcpUsed.length > 0
            ? "searching"
            : "thinking"
        : completedFlash
          ? "completed"
          : "idle";

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

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
      // Persist in the background — storage must never delay the AI request.
      void persistUser(
        text,
        uploaded.map((u) => ({ url: u.storagePath ?? "", storagePath: u.storagePath }))
      ).catch(() => {});
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
    router.push(`/bot/${bot.slug}/chat/new`);
  }

  // Stable identities so memoized children skip re-renders while streaming.
  const sendRef = useRef(send);
  sendRef.current = send;
  const stableSend = useCallback(
    (text: string, images: PendingImage[]) => sendRef.current(text, images),
    []
  );
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const toggleSpeak = useCallback((text: string) => {
    const v = voiceRef.current;
    if (v.speaking) v.stopSpeaking();
    else v.speak(text);
  }, []);
  const micToggle = useCallback(() => {
    const v = voiceRef.current;
    if (v.listening) v.stopListening();
    else v.startListening();
  }, []);
  const clearVoiceText = useCallback(() => setVoiceText(""), []);
  const voiceProp = useMemo(
    () => ({ listening: voice.listening, supported: voice.sttSupported, onMic: micToggle }),
    [voice.listening, voice.sttSupported, micToggle]
  );
  const speakState: SpeakState = useMemo(
    () => ({ supported: voice.ttsSupported, speaking: voice.speaking }),
    [voice.ttsSupported, voice.speaking]
  );

  const empty = messages.length === 0 && !streamed && !sending;

  // Bots show the bot's own photo (Bild), not the mascot.
  function avaState(s: AIStatus): BotAvatarState {
    if (s === "listening") return "listening";
    if (s === "thinking" || s === "searching") return "thinking";
    if (s === "generating" || s === "speaking") return "responding";
    if (s === "working") return "working";
    return "idle";
  }
  const photo = (size: number, state: AIStatus) => (
    <BotAvatar src={bot.avatar_url} name={bot.name} size={size} accent={bot.theme.accent} state={avaState(state)} />
  );

  // Real live activity only — never placeholder text.
  let liveLine: string | undefined;
  if (sending) {
    liveLine = streamed ? "Generating…" : mcpUsed.length > 0 ? "Searching…" : "Thinking…";
  } else if (voice.listening) {
    liveLine = "Listening…";
  } else if (voice.speaking) {
    liveLine = "Speaking…";
  } else if (completedFlash) {
    liveLine = "Done";
  }

  const composer = (
    <Composer
      onSend={stableSend}
      sending={sending}
      voiceText={voiceText}
      onVoiceTextConsumed={clearVoiceText}
      voice={voiceProp}
      statusLine={liveLine}
      placeholder={`Message ${bot.name}…`}
    />
  );

  return (
    <div className="relative flex h-full flex-col bg-black">
      <DynamicIsland
        status={botStatus}
        avatar={photo(22, botStatus)}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/chat-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 pl-10 lg:pl-0">
          {photo(30, botStatus === "idle" || botStatus === "completed" ? "idle" : botStatus)}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{bot.name}</p>
            <p className="truncate font-mono text-[11px] text-zinc-500">/bot/{bot.slug}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/bot/${bot.slug}`} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white" title="Bot profile">
            <ArrowLeft size={16} />
          </Link>
          <button onClick={newChat} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white" title={`New chat with ${bot.name}`}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="no-scrollbar relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
          <div className="w-full max-w-2xl">
            <div className="flex flex-col items-center text-center">
              {photo(120, botStatus)}
              <h1 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                How can I help you?
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-6 text-zinc-400">
                {bot.description || `Talk to ${bot.name}, your companion.`}
              </p>
            </div>
            <div className="mt-7 space-y-2">
              <TaskPanel botSlug={bot.slug} accent={bot.theme.accent} />
              {composer}
            </div>
          </div>
        </div>
      ) : (
        <MessageList scrollKey={`${messages.length}:${streamed.length}:${mcpUsed.length}`}>
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage
                key={`${conversationId}-${i}`}
                content={m.content}
                images={(m.images ?? []).filter((img) => img.url).map((img) => ({ url: img.url }))}
              />
            ) : (
              <AssistantMessage
                key={`${conversationId}-${i}`}
                content={m.content}
                avatarStatus="idle"
                avatarPhoto={{ src: bot.avatar_url, name: bot.name, accent: bot.theme.accent }}
                speak={speakState}
                onToggleSpeak={toggleSpeak}
              />
            )
          )}
          {(sending || streamed) &&
            (streamed ? (
              <AssistantMessage
                content={streamed}
                streaming
                avatarPhoto={{ src: bot.avatar_url, name: bot.name, accent: bot.theme.accent }}
              />
            ) : (
              <ThinkingRow
                label={`${bot.name} is thinking…`}
                avatar={photo(36, "thinking")}
              />
            ))}
          {error && (
            <div className="rounded-[22px] border border-accent/40 bg-accent/10 px-5 py-3.5 text-sm text-red-200">{error}</div>
          )}
          {mcpUsed.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {mcpUsed.map((u, i) => (
                <span key={i} className="rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 font-mono text-[11px] text-zinc-300">
                  {u.server} · {u.tool}
                </span>
              ))}
            </div>
          )}
        </MessageList>
      )}

      {!empty && (
        <div className="relative z-10">
          <div className="mx-auto w-full max-w-3xl space-y-2 px-4 pb-5 pt-2 sm:px-6">
            <TaskPanel botSlug={bot.slug} accent={bot.theme.accent} />
            <div className="flex items-center justify-center">
              <a href="/bots" className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:text-white">
                <Plug size={11} /> My Bots
              </a>
            </div>
            {composer}
          </div>
        </div>
      )}
    </div>
  );
}

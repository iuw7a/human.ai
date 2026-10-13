"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Phone, Settings, Square, Plus, Pencil, Trash2 } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Composer } from "@/components/ai/Composer";
import { MessageList } from "@/components/ai/MessageList";
import { UserMessage, AssistantMessage, ThinkingRow, type SpeakState } from "@/components/ai/Message";
import type { PendingImage } from "@/components/ChatInput";
import { useHumiMic } from "./useHumiMic";
import { CallInterface } from "./CallInterface";
import type { CallExchange, CallTransport } from "./useVoiceCall";
import { readChatStream } from "./useVoiceCall";
import {
  playHumiTts,
  stopHumiAudio,
  ttsLangFor,
  micLangFor,
} from "./humiAudio";

export interface HumiAssistantView {
  id: string;
  name: string;
  avatar_url: string;
  personality: string;
  custom_instructions: string;
  language: string;
  voice_enabled: boolean;
  model_id: string;
}

interface ChatItem {
  id: string;
  title: string | null;
  updated_at: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  images?: { url: string }[];
}

/**
 * Personal Humi conversation: text + voice input, server-TTS readout,
 * per-assistant history. Reuses Composer/Message primitives and /api/chat.
 */
export function HumiChatView({
  assistant,
  user,
  initialChats,
  initialChatId,
  initialMessages,
}: {
  assistant: HumiAssistantView;
  user: SupabaseUser;
  initialChats: ChatItem[];
  initialChatId: string | null;
  initialMessages: Msg[];
}) {
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [chats, setChats] = useState<ChatItem[]>(initialChats);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ttsHint, setTtsHint] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [callOpen, setCallOpen] = useState(false);
  const [callMicOk] = useState(
    () =>
      typeof window !== "undefined" &&
      (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window)) &&
      !!navigator.mediaDevices?.getUserMedia
  );

  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const speakTokenRef = useRef(0);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  const mic = useHumiMic({
    onTranscript: (t) => setVoiceText((prev) => (prev ? `${prev} ${t}` : t)),
    lang: micLangFor(assistant.language),
  });

  const avatarSrc = assistant.avatar_url || "/humi.png";

  const refreshChats = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("chats")
      .select("id,title,updated_at")
      .eq("user_id", user.id)
      .eq("humi_assistant_id", assistant.id)
      .order("updated_at", { ascending: false })
      .limit(30);
    setChats((data ?? []) as ChatItem[]);
  }, [assistant.id, user.id]);

  async function ensureChat(): Promise<string> {
    const cur = chatIdRef.current;
    if (cur) return cur;
    const r = await fetch(`/api/humi-assistants/${assistant.id}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: assistant.name }),
    });
    const j = (await r.json().catch(() => null)) as { chat?: { id: string } } | null;
    if (!r.ok || !j?.chat) throw new Error("Could not start a conversation. Run supabase/humi_schema.sql once.");
    setChatId(j.chat.id);
    chatIdRef.current = j.chat.id;
    void refreshChats();
    return j.chat.id;
  }

  async function persist(role: "user" | "assistant", content: string, images: { url: string }[], id: string) {
    const supabase = createClient();
    const { data: existing } = await supabase.from("chats").select("title").eq("id", id).maybeSingle();
    const needsTitle = !existing?.title || existing.title === "New Chat" || existing.title === assistant.name;
    await supabase.from("chats").upsert(
      {
        id,
        user_id: user.id,
        model_id: assistant.model_id,
        humi_assistant_id: assistant.id,
        title: role === "user" && needsTitle ? content.slice(0, 80) || assistant.name : (existing?.title ?? assistant.name),
      },
      { onConflict: "id" }
    );
    await supabase.from("messages").insert({
      chat_id: id,
      user_id: user.id,
      role,
      content,
      images: images.map((i) => ({ url: i.url.startsWith("data:") ? "" : i.url })),
    });
    await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", id);
    void refreshChats();
  }

  async function uploadImages(images: PendingImage[]): Promise<{ url: string }[]> {
    if (images.length === 0) return [];
    const form = new FormData();
    for (const img of images) {
      const blob = await (await fetch(img.dataUrl)).blob();
      form.append("files", blob, img.name || "image.png");
    }
    try {
      const up = await fetch("/api/upload", { method: "POST", body: form });
      if (up.ok) return images.map((i) => ({ url: i.dataUrl }));
    } catch {
      // storage optional — fall back to inline images
    }
    return images.map((i) => ({ url: i.dataUrl }));
  }

  const speakText = useCallback(
    async (text: string, key: string) => {
      const clean = text.trim();
      if (!clean) return;
      setTtsHint(null);
      stopHumiAudio();
      const token = ++speakTokenRef.current;
      setSpeakingKey(key);
      const outcome = await playHumiTts({
        text: clean,
        language: ttsLangFor(assistant.language, clean),
        onEnd: () => {
          if (speakTokenRef.current === token) setSpeakingKey(null);
        },
      });
      if (speakTokenRef.current !== token) return;
      if (outcome === "ok") return;
      setSpeakingKey(null);
      setTtsHint(
        outcome === "blocked"
          ? "Audio blocked by the browser — tap the page once, then try again."
          : "Spoken response failed. The text answer above is unaffected."
      );
    },
    [assistant.language]
  );

  const toggleSpeak = useCallback(
    (text: string, key: string) => {
      if (speakingKey) {
        speakTokenRef.current += 1;
        stopHumiAudio();
        setSpeakingKey(null);
      } else {
        void speakText(text, key);
      }
    },
    [speakingKey, speakText]
  );

  function stopAll() {
    abortRef.current?.abort();
    abortRef.current = null;
    speakTokenRef.current += 1;
    stopHumiAudio();
    setSpeakingKey(null);
    mic.stop();
  }

  async function send(text: string, pendingImages: PendingImage[]) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setStreamed("");
    setError(null);
    setTtsHint(null);
    try {
      const id = await ensureChat();
      const uploaded = await uploadImages(pendingImages);
      const userMsg: Msg = { role: "user", content: text, images: uploaded };
      const history = [...messages, userMsg];
      setMessages(history);
      void persist("user", text, uploaded, id).catch(() => {});

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: assistant.model_id,
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
            images: (m.images ?? [])
              .filter((i) => i.url.startsWith("data:") || i.url.startsWith("http"))
              .map((i) => ({ url: i.url })),
          })),
          assistantName: assistant.name,
          personality: assistant.personality,
          customInstructions: assistant.custom_instructions,
        }),
        signal: ctrl.signal,
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
      if (!full.trim()) throw new Error("Empty answer received. Please try again.");
      setMessages([...history, { role: "assistant", content: full }]);
      setStreamed("");
      void persist("assistant", full, [], id).catch(() => {});
      if (assistant.voice_enabled) void speakText(full, "live");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStreamed("");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setStreamed("");
      }
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function openChat(id: string) {
    if (sendingRef.current) return;
    stopAll();
    setChatId(id);
    chatIdRef.current = id;
    setMessages([]);
    setError(null);
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("role,content,images")
      .eq("chat_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages(
      (data ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
        images: ((m.images ?? []) as { url?: string }[])
          .filter((i) => i.url)
          .map((i) => ({ url: i.url as string })),
      }))
    );
  }

  function newConversation() {
    if (sendingRef.current) return;
    stopAll();
    setChatId(null);
    chatIdRef.current = null;
    setMessages([]);
    setStreamed("");
    setError(null);
  }

  function openCall() {
    if (sendingRef.current) return;
    stopAll();
    mic.stop();
    setError(null);
    setCallOpen(true);
  }

  const handleCallExchange = useCallback(
    (ex: CallExchange) => {
      // Adopt the call's conversation so text + voice share one history.
      setChatId(ex.chatId);
      chatIdRef.current = ex.chatId;
      setMessages((prev) => [...prev, { role: "user", content: ex.userText }, { role: "assistant", content: ex.assistantText }]);
      void persist("user", ex.userText, [], ex.chatId).catch(() => {});
      void persist("assistant", ex.assistantText, [], ex.chatId).catch(() => {});
      void refreshChats();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const callTransport: CallTransport = useMemo(
    () => ({
      startSession: async () => {
        const res = await fetch("/api/humi/voice-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistantId: assistant.id }),
        });
        const j = (await res.json().catch(() => null)) as { chat?: { id: string }; error?: string } | null;
        if (!res.ok || !j?.chat) throw new Error(j?.error ?? "Could not start a voice session.");
        return j.chat.id;
      },
      streamReply: async (chatId, history, onToken, signal) => {
        void chatId;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: assistant.model_id,
            messages: history.slice(-30).map((m) => ({ role: m.role, content: m.content })),
            assistantName: assistant.name,
            personality: assistant.personality,
            customInstructions: `${assistant.custom_instructions}\nKeep spoken replies short (1-3 sentences). Plain text only: no markdown, no lists, no code blocks.`,
          }),
          signal,
        });
        return readChatStream(res, onToken);
      },
    }),
    [assistant.id, assistant.model_id, assistant.name, assistant.personality, assistant.custom_instructions]
  );

  async function renameChat(id: string) {
    const title = editTitle.trim().slice(0, 80);
    setEditingId(null);
    if (!title) return;
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
    const supabase = createClient();
    await supabase.from("chats").update({ title }).eq("id", id).eq("user_id", user.id);
  }

  async function deleteChat(id: string) {
    if (!confirm("Delete this conversation and all its messages?")) return;
    stopAll();
    setChats((cs) => cs.filter((c) => c.id !== id));
    const supabase = createClient();
    await supabase.from("messages").delete().eq("chat_id", id).eq("user_id", user.id);
    await supabase.from("chats").delete().eq("id", id).eq("user_id", user.id);
    if (chatIdRef.current === id) newConversation();
    else void refreshChats();
  }

  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceProp = useMemo(
    () => ({
      listening: mic.listening,
      supported: mic.supported,
      onMic: () => (mic.listening ? mic.stop() : mic.start()),
    }),
    [mic]
  );
  const speakState: SpeakState = useMemo(
    () => ({ supported: true, speaking: speakingKey !== null }),
    [speakingKey]
  );

  let liveLine: string | undefined;
  if (sending) liveLine = streamed ? "Generating response…" : "Thinking…";
  else if (mic.listening) liveLine = "Listening…";
  else if (speakingKey) liveLine = "Speaking…";

  const empty = messages.length === 0 && !streamed && !sending;
  const avatarPhoto = { src: avatarSrc, name: assistant.name, accent: "#e5484d" };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Per-Humi history (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-800 lg:flex">
        <div className="p-3">
          <button onClick={newConversation} className="flex w-full items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
            <Plus size={16} /> New conversation
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {chats.length === 0 && <p className="px-2 py-4 text-center text-xs text-zinc-500">No conversations yet.</p>}
          {chats.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-lg ${c.id === chatId ? "bg-ink-800" : "hover:bg-ink-850"}`}>
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renameChat(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => void renameChat(c.id)}
                  className="mx-1 my-0.5 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[13px] text-zinc-100 focus:outline-none"
                />
              ) : (
                <>
                  <button onClick={() => void openChat(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px] text-zinc-300">
                    {c.title || assistant.name}
                  </button>
                  <span className="hidden shrink-0 items-center pr-1 group-hover:flex">
                    <button onClick={() => { setEditTitle(c.title || ""); setEditingId(c.id); }} className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-200" aria-label="Rename">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => void deleteChat(c.id)} className="rounded-md p-1.5 text-zinc-500 hover:text-accent" aria-label="Delete">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="relative flex min-h-0 flex-1 flex-col bg-black">
        <div className="relative z-10 flex items-center gap-3 px-4 py-3 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc} alt={assistant.name} className="h-9 w-9 rounded-full border border-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/humi.png"; }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{assistant.name}</p>
            <p className="text-xs text-zinc-500">
              {assistant.personality} · {assistant.voice_enabled ? "voice on" : "voice off"}
              {speakingKey ? " · speaking…" : ""}
            </p>
          </div>
          <Link href="/urhumi" className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-white">All Humis</Link>
          <button
            onClick={openCall}
            disabled={!callMicOk}
            aria-label="Start voice call"
            title={callMicOk ? `Call ${assistant.name}` : "Voice calls need Chrome or Edge with a microphone"}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <Phone size={14} /> Call
          </button>
          <Link href={`/urhumi/${assistant.id}/edit`} aria-label="Humi settings" title="Humi settings" className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.07] hover:text-white">
            <Settings size={17} />
          </Link>
        </div>

        {empty ? (
          <div className="no-scrollbar relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <div className="w-full max-w-2xl">
              <div className="flex flex-col items-center text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc} alt={assistant.name} className="h-24 w-24 rounded-full border border-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/humi.png"; }} />
                <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {assistant.name}
                </h1>
                <p className="mt-2 max-w-md text-[15px] leading-6 text-zinc-400">
                  Your personal Humi. Ask anything{assistant.voice_enabled ? ", dictate, or listen to answers" : ""}.
                </p>
              </div>
              <div className="mt-6">
                <Composer
                  onSend={(t, imgs) => void send(t, imgs)}
                  sending={sending}
                  placeholder={`Message ${assistant.name}…`}
                  voiceText={voiceText}
                  onVoiceTextConsumed={() => setVoiceText("")}
                  voice={voiceProp}
                  statusLine={liveLine}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <MessageList scrollKey={`${messages.length}:${streamed.length}`}>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={`${chatId}-${i}`} content={m.content} images={(m.images ?? []).filter((img) => img.url).map((img) => ({ url: img.url }))} />
                ) : (
                  <AssistantMessage
                    key={`${chatId}-${i}`}
                    content={m.content}
                    avatarPhoto={avatarPhoto}
                    speak={speakState}
                    onToggleSpeak={(t) => toggleSpeak(t, `msg-${i}`)}
                    vote={chatId ? { chatId, modelId: assistant.model_id } : null}
                  />
                )
              )}
              {(sending || streamed) &&
                (streamed ? <AssistantMessage content={streamed} streaming avatarPhoto={avatarPhoto} /> : <ThinkingRow />)}
              {error && (
                <div className="rounded-[22px] border border-accent/40 bg-accent/10 px-5 py-3.5 text-sm text-red-200">{error}</div>
              )}
              {ttsHint && (
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-5 py-3 text-[13px] text-zinc-400">{ttsHint}</div>
              )}
            </MessageList>
            <div className="relative z-10">
              <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2 sm:px-6">
                {(sending || speakingKey) && (
                  <div className="mb-2 flex justify-center">
                    <button onClick={stopAll} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                      <Square size={11} /> Stop
                    </button>
                  </div>
                )}
                <Composer
                  onSend={(t, imgs) => void send(t, imgs)}
                  sending={sending}
                  placeholder={`Message ${assistant.name}…`}
                  voiceText={voiceText}
                  onVoiceTextConsumed={() => setVoiceText("")}
                  voice={voiceProp}
                  statusLine={liveLine}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {callOpen && (
        <CallInterface
          title={assistant.name}
          avatarSrc={avatarSrc}
          transport={callTransport}
          language={assistant.language}
          initialHistory={messages.slice(-30).map((m) => ({ role: m.role, content: m.content }))}
          onExchange={handleCallExchange}
          onClose={() => setCallOpen(false)}
        />
      )}
    </div>
  );
}

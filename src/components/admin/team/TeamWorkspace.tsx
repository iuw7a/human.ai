"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowUp,
  Sparkles,
  ImagePlus,
  Video,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Loader2,
  AtSign,
  ChevronDown,
} from "lucide-react";
import { TeamPresenceBanner } from "./TeamPresenceBanner";
import { MarketingPostModal } from "./MarketingPostModal";
import { MediaGenerationModal } from "./MediaGenerationModal";
import { playHumiTts, stopHumiAudio } from "@/components/humi/humiAudio";
import { MascotAvatar } from "@/components/ai/MascotAvatar";
import {
  getTeamSessions,
  getActiveSessionId,
  setActiveSessionId,
  createNewTeamSession,
  type ChatMessage,
  INITIAL_MESSAGES,
} from "./teamSessions";

export function TeamWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<"auto" | "humi" | "rema" | "team">("auto");
  const [isSending, setIsSending] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bgOk, setBgOk] = useState(false);

  // Modals
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [mediaModalState, setMediaModalState] = useState<{
    open: boolean;
    type: "image" | "video";
    prompt?: string;
  }>({ open: false, type: "image" });

  // Mention dropdown
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Preload iconic background image
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setBgOk(true);
    probe.src = "/chat-bg.png";
  }, []);

  // Load and sync active session
  useEffect(() => {
    function syncActiveSession() {
      const all = getTeamSessions();
      let activeId = getActiveSessionId();
      if (!activeId || !all.some((s) => s.id === activeId)) {
        if (all.length > 0) {
          activeId = all[0].id;
          setActiveSessionId(activeId);
        } else {
          const fresh = createNewTeamSession();
          activeId = fresh.id;
        }
      }
      const cur = all.find((s) => s.id === activeId);
      if (cur) {
        setMessages(cur.messages && cur.messages.length > 0 ? cur.messages : INITIAL_MESSAGES);
      } else {
        setMessages(INITIAL_MESSAGES);
      }
    }

    syncActiveSession();
    window.addEventListener("team-sessions-updated", syncActiveSession);
    return () => window.removeEventListener("team-sessions-updated", syncActiveSession);
  }, []);

  // Save current messages to active session
  useEffect(() => {
    if (messages.length === 0) return;
    const all = getTeamSessions();
    const activeId = getActiveSessionId();
    if (!activeId) return;
    const idx = all.findIndex((s) => s.id === activeId);
    if (idx !== -1) {
      all[idx].messages = messages;
      all[idx].updatedAt = Date.now();
      const firstAdmin = messages.find((m) => m.sender === "admin");
      if (firstAdmin && (all[idx].title === "New Chat with Team" || all[idx].title.startsWith("محادثة جديدة"))) {
        all[idx].title = firstAdmin.text.slice(0, 36).trim() || all[idx].title;
      }
      try {
        localStorage.setItem("human_ai_team_sessions_v2", JSON.stringify(all));
      } catch {
        // ignore
      }
    }
  }, [messages]);

  // Auto scroll to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Handle input and mentions
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    if (lastAt !== -1 && lastAt === textBeforeCursor.length - 1) {
      setShowMentionMenu(true);
      setMentionQuery("");
    } else if (lastAt !== -1 && !textBeforeCursor.slice(lastAt).includes(" ")) {
      setShowMentionMenu(true);
      setMentionQuery(textBeforeCursor.slice(lastAt + 1).toLowerCase());
    } else {
      setShowMentionMenu(false);
    }
  }

  function insertMention(mention: "@humi " | "@rema " | "@team ") {
    const cursor = textareaRef.current?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf("@");
    const prefix = lastAt !== -1 ? input.slice(0, lastAt) : textBefore;
    const suffix = input.slice(cursor);
    const updated = prefix + mention + suffix;
    setInput(updated);
    setShowMentionMenu(false);
    if (mention === "@humi ") setTarget("humi");
    if (mention === "@rema ") setTarget("rema");
    if (mention === "@team ") setTarget("team");
    textareaRef.current?.focus();
  }

  async function handleSend(customText?: string) {
    const textToSend = (customText ?? input).trim();
    if (!textToSend || isSending) return;

    const userMsg: ChatMessage = {
      id: "admin-" + Date.now(),
      sender: "admin",
      text: textToSend,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setShowMentionMenu(false);
    setIsSending(true);

    try {
      const res = await fetch("/api/admin/team/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory,
          target,
          action: "chat",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get team response.");

      if (Array.isArray(data.replies)) {
        const incoming: ChatMessage[] = data.replies.map((r: { sender: "humi" | "rema"; text: string }, i: number) => ({
          id: `${r.sender}-${Date.now()}-${i}`,
          sender: r.sender,
          text: r.text,
          timestamp: Date.now() + i * 100,
        }));
        setMessages((prev) => [...prev, ...incoming]);
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: "sys-" + Date.now(),
        sender: "system",
        text: `⚠️ خطأ: ${err instanceof Error ? err.message : "تعذر الاتصال بخادم الذكاء الاصطناعي."}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  }

  function handleClearChat() {
    if (!confirm("هل تريد مسح رسائل الجلسة الحالية؟")) return;
    stopHumiAudio();
    setIsSpeakingId(null);
    setMessages([...INITIAL_MESSAGES]);
  }

  function handleCopy(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSpeak(id: string, text: string) {
    if (isSpeakingId === id) {
      stopHumiAudio();
      setIsSpeakingId(null);
      return;
    }
    stopHumiAudio();
    setIsSpeakingId(id);
    const lang = /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
    await playHumiTts({
      text,
      language: lang,
      onEnd: () => setIsSpeakingId(null),
    });
    setIsSpeakingId(null);
  }

  function handleInsertMedia(mediaUrl: string, mediaType: "image" | "video", prompt: string) {
    const newMsg: ChatMessage = {
      id: "media-" + Date.now(),
      sender: "admin",
      text: prompt ? `تم إنشاء ${mediaType === "image" ? "صورة" : "فيديو"}: "${prompt}"` : `تم إنشاء ${mediaType}`,
      mediaUrl,
      mediaType,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMsg]);
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-black overflow-hidden">
      {/* Background Red Dot Halftone (strictly contained in the chat view) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {bgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/chat-bg.png"
            alt=""
            className="h-full w-full object-cover opacity-90 select-none"
          />
        )}
      </div>

      {/* Top Bar Navigation */}
      <TeamPresenceBanner
        activeTarget={target}
        isSending={isSending}
        onSelectTarget={(t) => {
          setTarget(t);
          insertMention(t === "humi" ? "@humi " : t === "rema" ? "@rema " : "@team ");
        }}
        onOpenMarketingModal={() => setMarketingOpen(true)}
        onOpenMediaModal={(type) => setMediaModalState({ open: true, type })}
        onClearChat={handleClearChat}
      />

      {/* Messages Feed (Centered reading column) */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {messages.map((m) => {
            const isHumi = m.sender === "humi";
            const isRema = m.sender === "rema";
            const isAdmin = m.sender === "admin";
            const isSystem = m.sender === "system";

            if (isAdmin) {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-[22px] bg-white/[0.08] border border-white/10 px-4 py-3 text-[14px] text-white shadow-lg backdrop-blur-md">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    {m.mediaUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black">
                        {m.mediaType === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.mediaUrl} alt="" className="max-h-[360px] w-full object-contain" />
                        ) : (
                          <video src={m.mediaUrl} controls className="max-h-[360px] w-full" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex items-start gap-3.5">
                {/* Mascot Avatar */}
                <div className="shrink-0 mt-0.5">
                  {isHumi && (
                    <MascotAvatar
                      status={isSpeakingId === m.id ? "speaking" : "idle"}
                      size={38}
                      accent="#06b6d4"
                    />
                  )}
                  {isRema && (
                    <MascotAvatar
                      status={isSpeakingId === m.id ? "speaking" : "idle"}
                      size={38}
                      accent="#e5484d"
                    />
                  )}
                  {isSystem && (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black border border-white/10">
                      <Sparkles size={16} className="text-zinc-400" />
                    </div>
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`group relative flex-1 max-w-[85%] rounded-[24px] px-5 py-4 backdrop-blur-xl shadow-xl transition-all ${
                    isHumi
                      ? "bg-[#090d12]/90 border border-cyan-500/20 text-zinc-100"
                      : isRema
                      ? "bg-[#14080a]/90 border border-accent/20 text-zinc-100"
                      : "bg-red-950/20 border border-red-500/30 text-red-200"
                  }`}
                >
                  {/* Bubble Header */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${
                          isHumi ? "text-cyan-400" : isRema ? "text-accent" : "text-zinc-400"
                        }`}
                      >
                        {isHumi ? "Humi • AI Architect" : isRema ? "Rema • Creative Director" : "System"}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Action buttons (Speech / Copy) */}
                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      {(isHumi || isRema) && (
                        <button
                          onClick={() => handleSpeak(m.id, m.text)}
                          className={`rounded-lg p-1.5 text-zinc-400 hover:text-white transition-colors ${
                            isSpeakingId === m.id ? "text-accent animate-pulse" : ""
                          }`}
                          title={isSpeakingId === m.id ? "Stop voice" : "Listen to response"}
                        >
                          {isSpeakingId === m.id ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(m.id, m.text)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:text-white transition-colors"
                        title="Copy text"
                      >
                        {copiedId === m.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Bubble Content */}
                  <div className="whitespace-pre-wrap text-[14px] leading-relaxed tracking-normal text-zinc-100">
                    {m.text}
                  </div>

                  {/* Embedded Media if available */}
                  {m.mediaUrl && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black">
                      {m.mediaType === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.mediaUrl} alt="" className="max-h-[380px] w-full object-contain" />
                      ) : (
                        <video src={m.mediaUrl} controls className="max-h-[380px] w-full" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isSending && (
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black border border-white/10">
                <Loader2 size={15} className="animate-spin text-accent" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0a0a0d]/90 px-4 py-2">
                <span className="font-medium text-zinc-300">
                  {target === "team"
                    ? "هومي وريما يتشاوران في صياغة الرد..."
                    : target === "rema"
                    ? "ريما تكتب لك الآن..."
                    : "هومي يحلل ويكتب الرد..."}
                </span>
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>
      </div>

      {/* Mention Autocomplete Popup */}
      {showMentionMenu && (
        <div className="mx-auto w-full max-w-3xl px-4 z-20">
          <div className="max-w-xs rounded-2xl border border-white/10 bg-[#0a0a0d] p-2 shadow-2xl backdrop-blur-xl mb-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase text-zinc-500">من تريد استدعاءه؟</p>
            <div className="space-y-1">
              {[
                { tag: "@humi ", label: "Humi (هيومن)", role: "كبير مهندسي الذكاء", color: "text-cyan-400" },
                { tag: "@rema ", label: "Rema (ريما)", role: "مديرة الإبداع والتسويق", color: "text-accent" },
                { tag: "@team ", label: "Team (الفريق معاً)", role: "نقاش مشترك", color: "text-white" },
              ]
                .filter((item) => !mentionQuery || item.tag.toLowerCase().includes(mentionQuery))
                .map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertMention(item.tag as any)}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition-all hover:bg-white/[0.06]"
                  >
                    <div>
                      <span className={`text-xs font-bold ${item.color}`}>{item.tag}</span>
                      <span className="ml-1.5 text-xs text-zinc-300">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">{item.role}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Centered Composer (matches screenshot exactly) */}
      <div className="relative z-20 w-full px-4 pb-6 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[26px] border border-white/[0.09] bg-[#0a0a0d]/95 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="Ask Human AI anything..."
              aria-label="Composer input"
              className="max-h-[160px] w-full resize-none bg-transparent px-2 py-1 text-[14.5px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />

            <div className="mt-1 flex items-center gap-2 px-1">
              {/* Summon Selector Pill */}
              <button
                type="button"
                onClick={() => {
                  const next = target === "auto" ? "humi" : target === "humi" ? "rema" : target === "rema" ? "team" : "auto";
                  setTarget(next);
                }}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/20 hover:text-white"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    target === "humi" ? "bg-cyan-400" : target === "rema" ? "bg-accent" : "bg-white"
                  }`}
                />
                <span>{target === "auto" ? "Chat" : `@${target}`}</span>
                <ChevronDown size={13} className="text-zinc-400" />
              </button>

              {/* Media buttons */}
              <button
                type="button"
                onClick={() => setMediaModalState({ open: true, type: "image" })}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white"
                title="توليد صورة (Agnes Image)"
              >
                <ImagePlus size={16} />
              </button>

              <button
                type="button"
                onClick={() => setMediaModalState({ open: true, type: "video" })}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white"
                title="توليد فيديو (Video)"
              >
                <Video size={16} />
              </button>

              <button
                type="button"
                onClick={() => setMarketingOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent/15"
                title="Create me a new post"
              >
                <Sparkles size={16} />
              </button>

              <div className="flex-1" />

              {/* White circular send button with ArrowUp (as in screenshot) */}
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !input.trim()}
                className="btn-send !h-9 !w-9"
                aria-label="Send message"
              >
                {isSending ? <Loader2 size={16} className="animate-spin text-zinc-900" /> : <ArrowUp size={17} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Marketing Post Generator Modal */}
      <MarketingPostModal
        isOpen={marketingOpen}
        onClose={() => setMarketingOpen(false)}
        onInsertIntoChat={(post, imgPrompt) => {
          setMarketingOpen(false);
          const newMsg: ChatMessage = {
            id: "post-" + Date.now(),
            sender: "rema",
            text: `🚀 هذا هو المنشور التسويقي الجديد الذي صغته لك:\n\n${post}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, newMsg]);
          if (imgPrompt) {
            setMediaModalState({ open: true, type: "image", prompt: imgPrompt });
          }
        }}
        onGenerateImageForPost={(prompt) => {
          setMarketingOpen(false);
          setMediaModalState({ open: true, type: "image", prompt });
        }}
      />

      {/* Media Generation Modal */}
      <MediaGenerationModal
        isOpen={mediaModalState.open}
        type={mediaModalState.type}
        initialPrompt={mediaModalState.prompt}
        onClose={() => setMediaModalState((prev) => ({ ...prev, open: false }))}
        onInsertMedia={handleInsertMedia}
      />
    </div>
  );
}

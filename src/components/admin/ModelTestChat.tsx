"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function ModelTestChat({
  model,
  chatId,
}: {
  model: { id: string; name: string; provider: string };
  chatId: string;
}) {
  const storeKey = `admin-model-chat:${chatId}`;
  const [log, setLog] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setLog(JSON.parse(raw) as Msg[]);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(log.slice(-50)));
    } catch {
      // ignore
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, storeKey]);

  async function send() {
    const text = input.trim().slice(0, 4000);
    if (!text || busy) return;
    const next: Msg[] = [...log, { role: "user", content: text }];
    setLog(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chat-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, messages: next }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Request failed (${res.status}).`);
      }
      let acc = "";
      setLog([...next, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data) as { token?: string; error?: string };
            if (j.error) throw new Error(j.error);
            if (j.token) {
              acc += j.token;
              setLog([...next, { role: "assistant", content: acc }]);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative -m-4 flex h-[calc(100vh-64px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black sm:-m-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chat-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative z-10 flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-xs font-medium text-zinc-100">API · model test</span>
          <span className="font-mono text-[11px] text-zinc-400">{model.id}</span>
        </div>
        <div className="flex gap-1.5">
          <Link
            href={`/admin/models/free/${encodeURIComponent(model.id)}`}
            className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:text-white"
          >
            التفاصيل
          </Link>
          <Link
            href={`/admin/models/free/${encodeURIComponent(model.id)}/chat`}
            className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:text-white"
          >
            <Plus size={13} className="inline" /> New test
          </Link>
        </div>
      </div>

      <div className="relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2 sm:mx-auto sm:w-full sm:max-w-2xl">
        {log.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-xl font-semibold text-white">جرّب {model.name}</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-400">
              شات تجريبي للأدمن فقط — بنفس تصميم الشات، يجاوبك {model.name} مباشرة.
            </p>
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                m.role === "user" ? "bg-accent/90 text-white" : "border border-white/10 bg-black/60 text-zinc-100 backdrop-blur"
              }`}
            >
              {m.content || (busy && i === log.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        {error && (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="relative z-10 px-4 pb-4 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="flex items-end gap-2 rounded-[28px] border border-white/10 bg-black/70 p-2 pl-4 backdrop-blur">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`اسأل ${model.name}…`}
            className="min-h-10 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

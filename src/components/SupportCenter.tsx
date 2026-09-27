"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Ticket { id: string; subject: string; status: string; created_at: string; updated_at: string }
interface Msg { id: string; sender: string; body: string; created_at: string }

export function SupportCenter() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/support");
    const j = await res.json();
    setTickets(j.rows ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function open(id: string) {
    setOpenId(id);
    const res = await fetch(`/api/support/${id}`);
    const j = await res.json();
    setMessages(j.messages ?? []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Ticket created." : (j?.error ?? "Failed."));
    if (res.ok) {
      setSubject("");
      setBody("");
      load();
    }
  }

  async function sendReply() {
    if (!openId || !reply.trim()) return;
    const res = await fetch(`/api/support/${openId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    if (res.ok) {
      setReply("");
      open(openId);
      load();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ToastEl}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">New ticket</h2>
        <form onSubmit={create} className="card space-y-2 p-4">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="input" required />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe your issue…" rows={5} className="input" required />
          <button type="submit" className="btn-primary text-xs">Submit ticket</button>
        </form>
        <h2 className="mb-2 mt-4 text-sm font-semibold text-white">Your tickets</h2>
        <div className="card divide-y divide-ink-800/60">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => open(t.id)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-ink-850/50 ${openId === t.id ? "bg-ink-850/50" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{t.subject}</span>
                <span className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleString()}</span>
              </span>
              <StatusPill value={t.status} tone={t.status === "open" ? "red" : t.status === "pending" ? "amber" : "green"} />
            </button>
          ))}
          {tickets.length === 0 && <EmptyState text="No tickets yet." />}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-white">Conversation</h2>
        {!openId && <p className="card p-6 text-center text-sm text-zinc-500">Select a ticket to view replies.</p>}
        {openId && (
          <div className="card space-y-2 p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-sm ${m.sender === "user" ? "bg-ink-700 text-white" : "bg-ink-800 text-zinc-200"}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="input" />
              <button onClick={sendReply} className="btn-primary shrink-0 text-xs">Send</button>
            </div>
            <Link href="/support" className="hidden">support</Link>
          </div>
        )}
      </div>
    </div>
  );
}

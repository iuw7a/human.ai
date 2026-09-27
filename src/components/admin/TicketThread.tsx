"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill, useToast } from "@/components/admin/ui";

interface Msg { id: string; sender: string; body: string; created_at: string }

export function TicketThread({ ticketId, initial, initialStatus }: { ticketId: string; initial: Msg[]; initialStatus: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const { show, ToastEl } = useToast();

  async function send(newStatus?: string) {
    if (!draft.trim() && !newStatus) return;
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, body: draft.trim(), status: newStatus }),
    });
    if (!res.ok) {
      show("Failed.");
      return;
    }
    setDraft("");
    if (newStatus) setStatus(newStatus);
    const r2 = await fetch(`/api/admin/support/${ticketId}`);
    const j = await r2.json();
    setMessages(j.messages ?? []);
    router.refresh();
  }

  return (
    <div>
      {ToastEl}
      <div className="card mb-3 space-y-3 p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.sender === "admin" ? "bg-accent/20 text-zinc-100" : "bg-ink-800 text-zinc-200"}`}>
              <p className="mb-0.5 text-[11px] uppercase tracking-wide opacity-60">{m.sender}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-sm text-zinc-500">No messages.</p>}
      </div>
      <div className="card space-y-2 p-4">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Reply as admin…" className="input" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => send()} className="btn-primary text-xs">Send reply</button>
          <select value={status} onChange={(e) => send(e.target.value)} className="input !w-auto !py-1.5 text-xs">
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
          <StatusPill value={status} tone={status === "open" ? "red" : status === "pending" ? "amber" : "green"} />
        </div>
      </div>
    </div>
  );
}

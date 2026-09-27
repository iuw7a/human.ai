"use client";

import { useEffect, useState } from "react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";

interface Tpl { id: string; name: string; subject: string; body: string }
interface Log { id: string; to_email: string; subject: string; status: string; error: string | null; created_at: string }

export function EmailsManager() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tpl, setTpl] = useState({ name: "", subject: "", body: "" });
  const [email, setEmail] = useState("");
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/emails");
    const j = await res.json();
    setTemplates(j.templates ?? []);
    setLogs(j.logs ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveTpl() {
    if (!tpl.name.trim()) {
      show("Template name required.");
      return;
    }
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "template", ...tpl }),
    });
    show(res.ok ? "Template saved." : "Failed.");
    if (res.ok) {
      setTpl({ name: "", subject: "", body: "" });
      load();
    }
  }

  async function send(kind: "invite" | "reset") {
    const res = await fetch("/api/admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, email }),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Email sent via Supabase." : (j?.error ?? "Failed."));
    if (res.ok) {
      setEmail("");
      load();
    }
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold text-white">Invite / password reset</h2>
          <p className="text-xs text-zinc-500">Sent for real through Supabase Auth. Every attempt is logged below.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" className="input" type="email" />
          <div className="flex gap-2">
            <button onClick={() => send("invite")} className="btn-primary text-xs">Send invite</button>
            <button onClick={() => send("reset")} className="btn-ghost border border-ink-700 text-xs">Send reset</button>
          </div>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold text-white">Email template</h2>
          <input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="Template name" className="input" />
          <input value={tpl.subject} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} placeholder="Subject" className="input" />
          <textarea value={tpl.body} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} placeholder="Body" rows={3} className="input" />
          <button onClick={saveTpl} className="btn-primary text-xs">Save template</button>
          {templates.length > 0 && (
            <div className="pt-1">
              {templates.map((t) => (
                <p key={t.id} className="py-1 text-[13px] text-zinc-300">
                  <b>{t.name}</b> <span className="text-zinc-500">· {t.subject}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sent</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-ink-800/60 last:border-0">
                <td className="px-4 py-2.5 text-zinc-200">{l.to_email}</td>
                <td className="px-4 py-2.5 text-zinc-400">{l.subject}</td>
                <td className="px-4 py-2.5">
                  <StatusPill value={l.status} tone={l.status === "sent" ? "green" : "red"} />
                  {l.error && <p className="mt-1 font-mono text-[11px] text-red-300">{l.error}</p>}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <EmptyState text="No emails sent yet." />}
      </div>
    </div>
  );
}

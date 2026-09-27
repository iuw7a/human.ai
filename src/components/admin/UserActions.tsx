"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill, ConfirmButton, useToast } from "@/components/admin/ui";

export function UserActions({ id, plan, banned, status, existingNote = "" }: { id: string; plan: string; banned: boolean; status: string; existingNote?: string }) {
  const router = useRouter();
  const { show, ToastEl } = useToast();
  const [note, setNote] = useState<string | null>(null);

  async function op(body: Record<string, string>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Saved." : (j?.error ?? "Failed."));
    if (res.ok) router.refresh();
  }

  const btn = "btn-ghost !px-3 !py-1.5 text-xs border border-ink-700";
  return (
    <div className="flex flex-wrap gap-2">
      {ToastEl}
      {plan === "plus" ? (
        <button onClick={() => op({ op: "plan", plan: "free" })} className={btn}>Remove Plus</button>
      ) : (
        <button onClick={() => op({ op: "plan", plan: "plus" })} className={btn}>Give Plus</button>
      )}
      {banned ? (
        <button onClick={() => op({ op: "unban" })} className={btn}>Unban</button>
      ) : (
        <ConfirmButton onConfirm={() => op({ op: "ban" })} confirmText="Ban this user?" className={btn}>
          <span className="text-xs">Ban</span>
        </ConfirmButton>
      )}
      {status === "disabled" ? (
        <button onClick={() => op({ op: "enable" })} className={btn}>Re-enable</button>
      ) : (
        <ConfirmButton onConfirm={() => op({ op: "disable" })} confirmText="Disable this account?" className={btn}>
          <span className="text-xs">Disable</span>
        </ConfirmButton>
      )}
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) op({ op: "role", role: e.target.value }); e.target.value = ""; }}
        className="input !w-auto !px-2 !py-1.5 text-xs"
        title="Change role"
      >
        <option value="">Set role…</option>
        <option value="user">user</option>
        <option value="editor">editor</option>
        <option value="support">support</option>
        <option value="admin">admin</option>
        <option value="super_admin">super_admin</option>
      </select>
      <button onClick={() => setNote((n) => (n === null ? existingNote : null))} className={btn}>
        {note === null ? "Edit note" : "Close note"}
      </button>
      {note !== null && (
        <NoteEditor
          initial={note}
          onSave={(v) => {
            op({ op: "note", note: v });
            setNote(null);
          }}
        />
      )}
    </div>
  );
}

function NoteEditor({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex w-full gap-2">
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} placeholder="Internal admin note…" className="input" />
      <button onClick={() => onSave(v)} className="btn-primary shrink-0 text-xs">Save</button>
    </div>
  );
}

export function NoteView({ note, onEdit }: { note: string; onEdit: (v: string) => void }) {
  return <NoteEditor initial={note} onSave={onEdit} />;
}

export function Pill({ children, tone }: { children: React.ReactNode; tone?: "green" | "red" | "amber" | "gray" | "blue" }) {
  return <StatusPill value={String(children)} tone={tone} />;
}

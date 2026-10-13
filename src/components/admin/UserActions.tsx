"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill, ConfirmButton, useToast } from "@/components/admin/ui";

export function UserActions({
  id, plan, banned, status, subscriptionStatus, existingNote = "",
}: {
  id: string; plan: string; banned: boolean; status: string;
  subscriptionStatus?: string; existingNote?: string;
}) {
  const router = useRouter();
  const { show, ToastEl } = useToast();
  const [note, setNote] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantPlan, setGrantPlan] = useState("plus");
  const [duration, setDuration] = useState("30");
  const [customExpiry, setCustomExpiry] = useState("");

  async function op(body: Record<string, string | number>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Saved." : (j?.error ?? "Failed."));
    if (res.ok) {
      setGrantOpen(false);
      router.refresh();
    }
  }

  function grant() {
    const payload: Record<string, string | number> = {
      op: "plan",
      plan: grantPlan,
      source: "admin_grant",
    };
    if (duration === "custom") {
      if (!customExpiry) {
        show("Pick a custom expiry date.");
        return;
      }
      payload.expires_at = new Date(customExpiry).toISOString();
    } else {
      payload.duration_days = Number(duration);
    }
    void op(payload);
  }

  const btn = "btn-ghost !px-3 !py-1.5 text-xs border border-ink-700";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ToastEl}
      {!grantOpen ? (
        <button onClick={() => setGrantOpen(true)} className={btn}>
          {plan === "free" ? "Grant Plus/Pro…" : `Change ${plan}…`}
        </button>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-900 p-2">
          <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs">
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </select>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs">
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="custom">Custom…</option>
          </select>
          {duration === "custom" && (
            <input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} className="input !w-auto !px-2 !py-1 text-xs" />
          )}
          <button onClick={grant} className="btn-primary !px-2.5 !py-1 text-xs">Grant (admin_grant)</button>
          <button onClick={() => setGrantOpen(false)} className="btn-ghost !px-2.5 !py-1 text-xs">Cancel</button>
        </span>
      )}
      {plan !== "free" && (
        <ConfirmButton onConfirm={() => op({ op: "revoke" })} confirmText="Revoke admin grant?" className={btn}>
          <span className="text-xs">Revoke grant</span>
        </ConfirmButton>
      )}
      {subscriptionStatus === "suspended" ? (
        <button onClick={() => op({ op: "restore" })} className={btn}>Restore access</button>
      ) : (
        <button onClick={() => op({ op: "suspend" })} className={btn}>Suspend</button>
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

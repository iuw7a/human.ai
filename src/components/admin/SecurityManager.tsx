"use client";

import { useRouter } from "next/navigation";
import { StatusPill, EmptyState, ConfirmButton, useToast } from "@/components/admin/ui";

interface Evt { id: string; user_id: string | null; email: string; type: string; created_at: string }
interface RecentAdmin { id: string; user_id: string; name?: string; email?: string; type: string; created_at: string }

export function SecurityManager({ events, failed, recentAdmins }: { events: Evt[]; failed: number; recentAdmins: RecentAdmin[] }) {
  const router = useRouter();
  const { show, ToastEl } = useToast();

  async function revoke(id: string) {
    const res = await fetch("/api/admin/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    show(res.ok ? "Account disabled — sessions blocked." : "Failed.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Failed login attempts</p>
          <p className={`mt-1 text-2xl font-semibold ${failed > 0 ? "text-red-300" : "text-white"}`}>{failed}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">2FA</p>
          <p className="mt-1 text-sm text-zinc-300">Not enforced yet — supported later via Supabase MFA.</p>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-white">Recently active admins</h2>
        {recentAdmins.length === 0 && <p className="text-xs text-zinc-500">No admin sessions recorded.</p>}
        {recentAdmins.map((a) => (
          <div key={a.id} className="flex items-center justify-between border-b border-ink-800/50 py-2 text-sm last:border-0">
            <span className="text-zinc-200">{a.name || a.email} <span className="text-zinc-500">· {a.type}</span></span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{new Date(a.created_at).toLocaleString()}</span>
              <ConfirmButton onConfirm={() => revoke(a.user_id)} confirmText="Disable account?" className="btn-ghost !px-2 !py-1 text-xs">
                <span className="text-xs">Revoke</span>
              </ConfirmButton>
            </span>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-zinc-600">Revoke disables the account — all further requests are blocked server-side.</p>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-white">Login activity</h2>
        {events.length === 0 && <EmptyState text="No events recorded yet." />}
        {events.slice(0, 200).map((e) => (
          <p key={e.id} className="border-b border-ink-800/50 py-1.5 font-mono text-xs last:border-0">
            <StatusPill value={e.type} tone={e.type === "login_failed" ? "red" : e.type === "login" ? "green" : "gray"} />{" "}
            <span className="text-zinc-300">{e.email || e.user_id?.slice(0, 8) || "—"}</span>{" "}
            <span className="text-zinc-600">{new Date(e.created_at).toLocaleString()}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

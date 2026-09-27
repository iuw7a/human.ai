import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatusPill } from "@/components/admin/ui";
import { UserActions } from "@/components/admin/UserActions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: { id: string } }) {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: u, error } = await admin.auth.admin.getUserById(params.id);
  if (error || !u?.user) notFound();
  const user = u.user;

  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
  const banned =
    (user.banned_until != null && new Date(user.banned_until).getTime() > Date.now()) ||
    profile?.status === "banned";

  const [chats, messages, memories, files, feedback, keys, tickets, events] = await Promise.all([
    admin.from("chats").select("id,title,created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("attachments").select("id,storage_path,size_bytes,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("feedback").select("id,rating,model,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("api_keys").select("id,name,prefix,enabled,usage_count,last_used_at,created_at").eq("user_id", user.id),
    admin.from("support_tickets").select("id,subject,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("audit_logs").select("action,created_at").eq("target", user.id).order("created_at", { ascending: false }).limit(10),
  ]);

  const plan = profile?.plan ?? "free";
  const status = profile?.status ?? "active";

  return (
    <div>
      <PageHeader
        title={profile?.name || user.email || "User"}
        sub={user.id}
        action={<Link href="/admin/users" className="btn-ghost border border-ink-700 text-xs">← All users</Link>}
      />

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <p><span className="text-zinc-500">Email:</span> <span className="text-white">{user.email}</span></p>
          <p><span className="text-zinc-500">Registered:</span> <span className="text-white">{new Date(user.created_at).toLocaleString()}</span></p>
          <p><span className="text-zinc-500">Last login:</span> <span className="text-white">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"}</span></p>
          <p><span className="text-zinc-500">Providers:</span> <span className="text-white">{(user.app_metadata?.providers ?? []).join(", ") || "—"}</span></p>
        </div>
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2"><span className="text-zinc-500">Plan:</span> <StatusPill value={plan} tone={plan === "plus" ? "amber" : "gray"} /></p>
          <p className="flex items-center gap-2"><span className="text-zinc-500">Status:</span> <StatusPill value={banned ? "banned" : status} tone={banned || status !== "active" ? "red" : "green"} /></p>
          <p className="flex items-center gap-2"><span className="text-zinc-500">Role:</span> <StatusPill value={profile?.role ?? "user"} tone="blue" /></p>
          <p><span className="text-zinc-500">Chats:</span> <span className="text-white">{chats.count ?? 0}</span> · <span className="text-zinc-500">Messages:</span> <span className="text-white">{messages.count ?? 0}</span> · <span className="text-zinc-500">Memories:</span> <span className="text-white">{memories.count ?? 0}</span></p>
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Admin actions</h2>
      <UserActions id={user.id} plan={plan} banned={banned} status={status} existingNote={profile?.admin_notes ?? ""} />

      {profile?.admin_notes && (
        <div className="card mt-4 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Internal note</p>
          <p className="mt-1 text-sm text-zinc-300">{profile.admin_notes}</p>
        </div>
      )}

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Recent chats</h3>
          {(chats.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(chats.data ?? []).map((c) => (
            <p key={c.id} className="truncate py-1 text-[13px] text-zinc-300">
              {c.title || "New conversation"} <span className="text-zinc-600">· {new Date(c.created_at).toLocaleDateString()}</span>
            </p>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">API keys ({(keys.data ?? []).length})</h3>
          {(keys.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(keys.data ?? []).map((k) => (
            <p key={k.id} className="py-1 text-[13px] text-zinc-300">
              {k.name} <span className="font-mono text-zinc-500">{k.prefix}…</span> · used {k.usage_count}× {k.enabled ? "" : "(disabled)"}
            </p>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Files ({(files.data ?? []).length} recent)</h3>
          {(files.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(files.data ?? []).map((f) => (
            <p key={f.id} className="truncate py-1 font-mono text-xs text-zinc-400">{f.storage_path}</p>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Support tickets</h3>
          {(tickets.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(tickets.data ?? []).map((t) => (
            <p key={t.id} className="py-1 text-[13px] text-zinc-300">
              {t.subject} <StatusPill value={t.status} tone={t.status === "open" ? "red" : t.status === "pending" ? "amber" : "green"} />
            </p>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Feedback</h3>
          {(feedback.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(feedback.data ?? []).map((f) => (
            <p key={f.id} className="py-1 text-[13px] text-zinc-300">
              {f.rating === "up" ? "👍" : "👎"} {f.model ?? ""} <StatusPill value={f.status} tone="gray" />
            </p>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Admin activity on this user</h3>
          {(events.data ?? []).length === 0 && <p className="text-xs text-zinc-500">None.</p>}
          {(events.data ?? []).map((e, i) => (
            <p key={i} className="py-1 text-[13px] text-zinc-300">
              {e.action} <span className="text-zinc-600">· {new Date(e.created_at).toLocaleString()}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

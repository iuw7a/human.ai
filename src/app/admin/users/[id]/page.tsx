import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatusPill } from "@/components/admin/ui";
import { UserActions } from "@/components/admin/UserActions";
import { SubscriptionBadge, SourceBadge } from "@/components/SubscriptionBadge";
import { getEntitlements } from "@/lib/subscriptions";

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

  const [chats, messages, memories, files, feedback, keys, tickets, events, subEvents] = await Promise.all([
    admin.from("chats").select("id,title,created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("attachments").select("id,storage_path,size_bytes,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("feedback").select("id,rating,model,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("api_keys").select("id,name,prefix,enabled,usage_count,last_used_at,created_at").eq("user_id", user.id),
    admin.from("support_tickets").select("id,subject,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("audit_logs").select("action,created_at").eq("target", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("subscription_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);

  const plan = profile?.plan ?? "free";
  const status = profile?.status ?? "active";
  const subStatus = profile?.subscription_status ?? (plan === "free" ? "free" : "active");
  const source = profile?.subscription_source ?? null;

  // Resolve changer emails for subscription history.
  const changerIds = [...new Set((subEvents.data ?? []).map((e) => e.changed_by).filter(Boolean))] as string[];
  let changerMap: Record<string, string> = {};
  if (changerIds.length > 0) {
    const { data: changers } = await admin.from("profiles").select("id,email,name").in("id", changerIds);
    changerMap = Object.fromEntries((changers ?? []).map((c) => [c.id, c.email ?? c.name ?? c.id.slice(0, 8)]));
  }
  const entitlements = await getEntitlements().catch(() => null);

  return (
    <div>
      <PageHeader
        title={profile?.name || user.email || "User"}
        sub={user.id}
        action={<Link href="/admin/users" className="btn-ghost border border-ink-700 text-xs">← All users</Link>}
      />

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-ink-700" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-700 text-lg font-semibold text-white">
                {((profile?.name ?? user.email ?? "?")[0] ?? "?").toUpperCase()}
              </span>
            )}
            <div>
              <SubscriptionBadge name={profile?.name ?? user.email ?? "User"} plan={plan} />
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{user.id}</p>
            </div>
          </div>
          <p><span className="text-zinc-500">Email:</span> <span className="text-white">{user.email}</span></p>
          <p><span className="text-zinc-500">Registered:</span> <span className="text-white">{new Date(user.created_at).toLocaleString()}</span></p>
          <p><span className="text-zinc-500">Account created:</span> <span className="text-white">{profile?.created_at ? new Date(profile.created_at).toLocaleString() : "—"}</span></p>
          <p><span className="text-zinc-500">Last login:</span> <span className="text-white">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"}</span></p>
          <p><span className="text-zinc-500">Providers:</span> <span className="text-white">{(user.app_metadata?.providers ?? []).join(", ") || "—"}</span></p>
        </div>
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2"><span className="text-zinc-500">Plan:</span> <StatusPill value={plan} tone={plan === "pro" ? "blue" : plan === "plus" ? "amber" : "gray"} /></p>
          <p className="flex items-center gap-2"><span className="text-zinc-500">Subscription:</span> <StatusPill value={banned ? "banned" : subStatus} tone={banned ? "red" : subStatus === "active" ? "green" : subStatus === "suspended" ? "red" : subStatus === "expired" ? "amber" : "gray"} /></p>
          <p className="flex items-center gap-2"><span className="text-zinc-500">Account:</span> <StatusPill value={banned ? "banned" : status} tone={banned || status !== "active" ? "red" : "green"} /></p>
          <p className="flex items-center gap-2"><span className="text-zinc-500">Role:</span> <StatusPill value={profile?.role ?? "user"} tone="blue" /></p>
          <p><SourceBadge source={source} /></p>
          <p><span className="text-zinc-500">Start:</span> <span className="text-white">{profile?.subscription_starts_at ? new Date(profile.subscription_starts_at).toLocaleString() : "—"}</span></p>
          <p><span className="text-zinc-500">Expires:</span> <span className="text-white">{profile?.subscription_expires_at ? new Date(profile.subscription_expires_at).toLocaleString() : "—"}</span></p>
          {profile?.subscription_provider_ref && <p><span className="text-zinc-500">Provider ref:</span> <span className="font-mono text-white">{profile.subscription_provider_ref}</span></p>}
          <p><span className="text-zinc-500">AI access:</span> <span className="text-white">{entitlements ? (entitlements[plan as keyof typeof entitlements] ?? ["light"]).join(", ") : "light"}</span></p>
          <p><span className="text-zinc-500">Chats:</span> <span className="text-white">{chats.count ?? 0}</span> · <span className="text-zinc-500">Messages:</span> <span className="text-white">{messages.count ?? 0}</span> · <span className="text-zinc-500">Memories:</span> <span className="text-white">{memories.count ?? 0}</span></p>
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Subscription actions</h2>
      <UserActions id={user.id} plan={plan} banned={banned} status={status} subscriptionStatus={subStatus} existingNote={profile?.admin_notes ?? ""} />

      {profile?.admin_notes && (
        <div className="card mt-4 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Internal note</p>
          <p className="mt-1 text-sm text-zinc-300">{profile.admin_notes}</p>
        </div>
      )}

      <div className="card mt-4 p-4">
        <h3 className="mb-2 text-sm font-semibold text-white">Subscription history</h3>
        {(subEvents.data ?? []).length === 0 && <p className="text-xs text-zinc-500">No changes recorded yet.</p>}
        {(subEvents.data ?? []).map((e) => (
          <p key={e.id} className="border-b border-ink-800/40 py-1.5 text-[13px] text-zinc-300 last:border-0">
            {e.from_plan} → <b>{e.to_plan}</b>
            {e.source && <span className="ml-1.5 rounded-full bg-ink-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{e.source}</span>}
            {e.status && <span className="ml-1 text-[11px] text-zinc-500">({e.status})</span>}
            {e.changed_by && <span className="ml-1.5 text-zinc-400">by {changerMap[e.changed_by] ?? String(e.changed_by).slice(0, 8)}</span>}
            <span className="text-zinc-600"> · {new Date(e.created_at).toLocaleString()}</span>
          </p>
        ))}
      </div>

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

import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, DaysTabs, BarChart } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  await requireAdmin();
  const days = [7, 30, 90].includes(Number(searchParams.days))
    ? Number(searchParams.days)
    : 30;
  const admin = createAdminSupabase();
  const now = Date.now();
  const start = now - days * 86400000;
  const prevStart = now - 2 * days * 86400000;

  // ---- users (paginated, real) ----
  let allUsers: { id: string; email?: string; created_at: string; last_sign_in_at?: string; banned_until?: string }[] = [];
  let page = 1;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 500 });
    const batch = data?.users ?? [];
    allUsers = allUsers.concat(batch);
    if (batch.length < 500) break;
    page++;
    if (page > 20) break;
  }
  const { data: profiles } = await admin.from("profiles").select("id,plan,status,role");
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const isBanned = (u: (typeof allUsers)[number]) =>
    (u.banned_until && new Date(u.banned_until).getTime() > now) ||
    profileMap.get(u.id)?.status === "banned";
  const planOf = (id: string) => profileMap.get(id)?.plan ?? "free";

  const totalUsers = allUsers.length;
  const newUsers = allUsers.filter((u) => new Date(u.created_at).getTime() >= start).length;
  const newUsersPrev = allUsers.filter(
    (u) => new Date(u.created_at).getTime() >= prevStart && new Date(u.created_at).getTime() < start
  ).length;
  const activeUsers = allUsers.filter(
    (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= start
  ).length;
  const bannedUsers = allUsers.filter(isBanned).length;
  const plusUsers = allUsers.filter((u) => planOf(u.id) === "plus").length;

  // ---- chats / messages ----
  const [{ count: totalChats }, { count: totalMessages }] = await Promise.all([
    admin.from("chats").select("id", { count: "exact", head: true }),
    admin.from("messages").select("id", { count: "exact", head: true }),
  ]);
  const { data: recentMsgs } = await admin
    .from("messages")
    .select("created_at,role")
    .gte("created_at", new Date(prevStart).toISOString())
    .order("created_at", { ascending: true })
    .limit(10000);
  const msgsIn = (recentMsgs ?? []).filter((m) => new Date(m.created_at).getTime() >= start);
  const msgsPrev = (recentMsgs ?? []).length - msgsIn.length;
  const aiRequests = msgsIn.filter((m) => m.role === "assistant").length;

  // ---- storage / misc ----
  const { data: sizes } = await admin.from("attachments").select("size_bytes");
  const storageBytes = (sizes ?? []).reduce((s, a) => s + (a.size_bytes ?? 0), 0);
  const [{ count: feedbackCount }, { count: errorCount }, { data: apiKeys }] = await Promise.all([
    admin.from("feedback").select("id", { count: "exact", head: true }),
    admin.from("app_errors").select("id", { count: "exact", head: true }),
    admin.from("api_keys").select("usage_count"),
  ]);
  const apiUsage = (apiKeys ?? []).reduce((s, k) => s + (k.usage_count ?? 0), 0);

  const pct = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

  // ---- daily buckets for charts ----
  const buckets: { label: string; users: number; messages: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = dayKey(d);
    buckets.push({
      label: key.slice(5),
      users: allUsers.filter((u) => dayKey(new Date(u.created_at)) === key).length,
      messages: (recentMsgs ?? []).filter((m) => dayKey(new Date(m.created_at)) === key).length,
    });
  }

  const fmtBytes = (b: number) =>
    b > 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub="Real platform statistics from your database."
        action={<DaysTabs value={days} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={totalUsers} />
        <StatCard label={`New users (${days}d)`} value={newUsers} delta={pct(newUsers, newUsersPrev)} hint="vs prev." />
        <StatCard label={`Active users (${days}d)`} value={activeUsers} />
        <StatCard label="Banned users" value={bannedUsers} />
        <StatCard label="Plus users" value={plusUsers} />
        <StatCard label="Free users" value={totalUsers - plusUsers} />
        <StatCard label="Total chats" value={totalChats ?? 0} />
        <StatCard label="Total messages" value={totalMessages ?? 0} />
        <StatCard label={`AI responses (${days}d)`} value={aiRequests} delta={pct(msgsIn.length, msgsPrev)} hint="msgs vs prev." />
        <StatCard label="API key usage" value={apiUsage} />
        <StatCard label="Storage used" value={fmtBytes(storageBytes)} />
        <StatCard label="Errors logged" value={errorCount ?? 0} />
        <StatCard label="Feedback" value={feedbackCount ?? 0} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">New registrations</h2>
          <p className="mb-3 text-xs text-zinc-500">Per day, last {days} days</p>
          <BarChart data={buckets.map((b) => ({ label: b.label, value: b.users }))} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">Chat & message activity</h2>
          <p className="mb-3 text-xs text-zinc-500">Messages per day, last {days} days</p>
          <BarChart data={buckets.map((b) => ({ label: b.label, value: b.messages }))} />
        </div>
      </div>
    </div>
  );
}

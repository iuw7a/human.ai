import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { UsersTable, type AdminUserRow } from "@/components/admin/UsersTable";
import { getEntitlements } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string; sort?: string; page?: string };
}) {
  await requireAdmin();
  const admin = createAdminSupabase();
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const filter = searchParams.filter ?? "all";
  const sort = searchParams.sort ?? "newest";
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const perPage = 20;

  let all: { id: string; email?: string; created_at: string; last_sign_in_at?: string; banned_until?: string }[] = [];
  let p = 1;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page: p, perPage: 500 });
    const batch = data?.users ?? [];
    all = all.concat(batch);
    if (batch.length < 500 || p > 20) break;
    p++;
  }
  const { data: profilesRaw } = await admin
    .from("profiles")
    .select(
      "id,name,avatar_url,plan,status,role,subscription_status,subscription_source,subscription_starts_at,subscription_expires_at"
    );
  // Pre-migration fallback: legacy columns only.
  let profiles: typeof profilesRaw = profilesRaw;
  if (!profilesRaw) {
    const legacy = await admin.from("profiles").select("id,name,avatar_url,plan,status,role");
    profiles = ((legacy.data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...r,
      subscription_status: r.plan === "free" ? "free" : "active",
      subscription_source: null,
      subscription_starts_at: null,
      subscription_expires_at: null,
    })) as unknown as typeof profilesRaw;
  }
  const pmap = new Map((profiles ?? []).map((x) => [x.id, x]));
  const entitlements = await getEntitlements().catch(() => ({ free: ["light"], plus: ["light", "pro"], pro: ["light", "pro", "high", "extra"] }) as Record<string, string[]>);

  let rows: AdminUserRow[] = all.map((u) => {
    const pr = pmap.get(u.id) as {
      name?: string; avatar_url?: string | null; plan?: string; status?: string; role?: string;
      subscription_status?: string; subscription_source?: string | null;
      subscription_starts_at?: string | null; subscription_expires_at?: string | null;
    } | undefined;
    const banned =
      (u.banned_until != null && new Date(u.banned_until).getTime() > Date.now()) ||
      pr?.status === "banned";
    const plan = pr?.plan ?? "free";
    return {
      id: u.id,
      email: u.email ?? "",
      name: pr?.name ?? "",
      avatar_url: pr?.avatar_url ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned,
      plan,
      status: pr?.status ?? "active",
      role: pr?.role ?? "user",
      subscription_status: pr?.subscription_status ?? (plan === "free" ? "free" : "active"),
      subscription_source: pr?.subscription_source ?? null,
      subscription_starts_at: pr?.subscription_starts_at ?? null,
      subscription_expires_at: pr?.subscription_expires_at ?? null,
      access_levels: entitlements[plan as keyof typeof entitlements] ?? ["light"],
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }
  if (filter === "pro") rows = rows.filter((r) => r.plan === "pro");
  if (filter === "plus") rows = rows.filter((r) => r.plan === "plus");
  if (filter === "free") rows = rows.filter((r) => r.plan === "free");
  if (filter === "banned") rows = rows.filter((r) => r.banned);
  if (filter === "active") rows = rows.filter((r) => !r.banned && r.status === "active");
  if (filter === "expired") rows = rows.filter((r) => r.subscription_status === "expired");
  if (filter === "suspended") rows = rows.filter((r) => r.subscription_status === "suspended");

  rows.sort((a, b) => {
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
    if (sort === "email") return a.email.localeCompare(b.email);
    return b.created_at.localeCompare(a.created_at);
  });

  const total = rows.length;
  const slice = rows.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      <PageHeader title="Users" sub={`${total} accounts. Search, filter, ban, grant Plus/Pro.`} />
      <UsersTable rows={slice} total={total} page={page} perPage={perPage} q={searchParams.q ?? ""} filter={filter} sort={sort} />
    </div>
  );
}

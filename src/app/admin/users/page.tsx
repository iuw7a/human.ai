import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { UsersTable, type AdminUserRow } from "@/components/admin/UsersTable";

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
  const { data: profiles } = await admin.from("profiles").select("id,name,plan,status,role");
  const pmap = new Map((profiles ?? []).map((x) => [x.id, x]));

  let rows: AdminUserRow[] = all.map((u) => {
    const pr = pmap.get(u.id);
    const banned =
      (u.banned_until != null && new Date(u.banned_until).getTime() > Date.now()) ||
      pr?.status === "banned";
    return {
      id: u.id,
      email: u.email ?? "",
      name: pr?.name ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned,
      plan: pr?.plan ?? "free",
      status: pr?.status ?? "active",
      role: pr?.role ?? "user",
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
  if (filter === "plus") rows = rows.filter((r) => r.plan === "plus");
  if (filter === "free") rows = rows.filter((r) => r.plan !== "plus");
  if (filter === "banned") rows = rows.filter((r) => r.banned);
  if (filter === "active") rows = rows.filter((r) => !r.banned && r.status === "active");

  rows.sort((a, b) => {
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
    if (sort === "email") return a.email.localeCompare(b.email);
    return b.created_at.localeCompare(a.created_at);
  });

  const total = rows.length;
  const slice = rows.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      <PageHeader title="Users" sub={`${total} accounts. Search, filter, ban, grant Plus.`} />
      <UsersTable rows={slice} total={total} page={page} perPage={perPage} q={searchParams.q ?? ""} filter={filter} sort={sort} />
    </div>
  );
}

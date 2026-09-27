import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { SecurityManager } from "@/components/admin/SecurityManager";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: events } = await admin.from("auth_events").select("*").order("created_at", { ascending: false }).limit(300);
  const failed = (events ?? []).filter((e) => e.type === "login_failed").length;
  const { data: profiles } = await admin.from("profiles").select("id,name,email").in("role", ["admin", "super_admin"]);
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const recentAdmins = (events ?? [])
    .filter((e) => e.user_id && pmap.has(e.user_id) && e.type !== "login_failed")
    .slice(0, 20)
    .map((e) => ({ ...e, name: pmap.get(e.user_id)?.name, email: pmap.get(e.user_id)?.email ?? e.email }));
  return (
    <div>
      <PageHeader title="Security" sub="Login activity, failures, and admin sessions." />
      <SecurityManager events={events ?? []} failed={failed} recentAdmins={recentAdmins} />
    </div>
  );
}

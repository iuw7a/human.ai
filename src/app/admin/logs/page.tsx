import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { LogsViewer } from "@/components/admin/LogsViewer";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data } = await admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
  const emails = new Map<string, string>();
  for (const id of ids.slice(0, 100)) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user?.email) emails.set(id, u.user.email);
  }
  return (
    <div>
      <PageHeader title="Audit Logs" sub="Every sensitive admin action, recorded." />
      <LogsViewer rows={rows.map((r) => ({ ...r, admin_email: emails.get(r.admin_id) ?? (r.admin_id ?? "").slice(0, 8) }))} />
    </div>
  );
}

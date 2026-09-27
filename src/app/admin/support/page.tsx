import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { SupportList } from "@/components/admin/SupportList";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: tickets } = await admin.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
  const ownerIds = [...new Set((tickets ?? []).map((t) => t.user_id))];
  const owners = new Map<string, string>();
  for (const id of ownerIds.slice(0, 100)) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user?.email) owners.set(id, u.user.email);
  }
  return (
    <div>
      <PageHeader title="Support" sub="User tickets. Open one to reply." />
      <SupportList rows={(tickets ?? []).map((t) => ({ ...t, owner: owners.get(t.user_id) ?? t.user_id.slice(0, 8) }))} />
    </div>
  );
}

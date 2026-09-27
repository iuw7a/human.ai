import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { SubscriptionsManager } from "@/components/admin/SubscriptionsManager";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: profiles } = await admin.from("profiles").select("id,name,email,plan,status").order("plan", { ascending: false }).limit(500);
  const { data: events } = await admin.from("subscription_events").select("*").order("created_at", { ascending: false }).limit(100);
  return (
    <div>
      <PageHeader title="Subscriptions" sub="Grant or remove Plus. Changes apply immediately." />
      <SubscriptionsManager
        rows={(profiles ?? []).map((p) => ({ id: p.id, name: p.name ?? "", email: p.email ?? "", plan: p.plan ?? "free", status: p.status ?? "active" }))}
        events={events ?? []}
      />
    </div>
  );
}

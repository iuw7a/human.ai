import { requireAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { SubscriptionsManager } from "@/components/admin/SubscriptionsManager";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id,name,email,avatar_url,plan,status,subscription_status,subscription_source,subscription_starts_at,subscription_expires_at,subscription_provider_ref,subscription_granted_by,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const { data: events } = await admin.from("subscription_events").select("*").order("created_at", { ascending: false }).limit(150);
  const changerIds = [...new Set((events ?? []).map((e) => e.changed_by).filter(Boolean))].slice(0, 50) as string[];
  let changerMap: Record<string, string> = {};
  if (changerIds.length > 0) {
    const { data: changers } = await admin.from("profiles").select("id,email,name").in("id", changerIds);
    changerMap = Object.fromEntries((changers ?? []).map((c) => [c.id, c.email ?? c.name ?? c.id.slice(0, 8)]));
  }
  return (
    <div>
      <PageHeader title="Subscriptions" sub="Assign, suspend, restore, revoke. Admin grants are recorded as admin_grant — never as payment." />
      <SubscriptionsManager
        rows={(profiles ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? "",
          email: p.email ?? "",
          avatar_url: p.avatar_url ?? null,
          plan: p.plan ?? "free",
          status: p.status ?? "active",
          subscription_status: p.subscription_status ?? (p.plan === "free" ? "free" : "active"),
          subscription_source: p.subscription_source ?? null,
          subscription_starts_at: p.subscription_starts_at ?? null,
          subscription_expires_at: p.subscription_expires_at ?? null,
          subscription_provider_ref: p.subscription_provider_ref ?? null,
          subscription_granted_by: p.subscription_granted_by ?? null,
          created_at: p.created_at ?? new Date().toISOString(),
        }))}
        events={(events ?? []).map((e) => ({
          ...e,
          changed_by_email: e.changed_by ? (changerMap[e.changed_by] ?? String(e.changed_by).slice(0, 8)) : null,
        }))}
      />
    </div>
  );
}

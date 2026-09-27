import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { AnnouncementsManager } from "@/components/admin/AnnouncementsManager";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Notifications" sub="System notices, warnings, and updates for targeted audiences." />
      <AnnouncementsManager kinds={["notice"]} />
    </div>
  );
}

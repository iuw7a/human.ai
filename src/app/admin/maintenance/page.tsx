import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { MaintenanceManager } from "@/components/admin/MaintenanceManager";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Maintenance" sub="Real server-side maintenance mode." />
      <MaintenanceManager />
    </div>
  );
}

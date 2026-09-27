import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { SettingsManager } from "@/components/admin/SettingsManager";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Settings" sub="Admin profile and safe system configuration." />
      <SettingsManager />
    </div>
  );
}

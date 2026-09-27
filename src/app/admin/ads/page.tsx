import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { AdsManager } from "@/components/admin/AdsManager";

export const dynamic = "force-dynamic";

export default async function AdminAdsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Ads Manager" sub="Database-backed. Active ads display beneath AI responses." />
      <AdsManager />
    </div>
  );
}

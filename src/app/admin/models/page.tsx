import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { ModelsManager } from "@/components/admin/ModelsManager";

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Models" sub="Database-backed. Changes apply to /api/chat immediately." />
      <ModelsManager />
    </div>
  );
}

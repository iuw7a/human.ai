import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { ApiKeysManager } from "@/components/admin/ApiKeysManager";

export const dynamic = "force-dynamic";

export default async function AdminApiKeysPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="API Keys" sub="Hashed storage, prefix display only. Secrets shown once." />
      <ApiKeysManager />
    </div>
  );
}

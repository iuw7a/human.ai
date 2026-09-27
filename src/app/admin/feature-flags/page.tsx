import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { FlagsManager } from "@/components/admin/FlagsManager";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Feature Flags" sub="Enable or disable capabilities without deploying." />
      <FlagsManager />
    </div>
  );
}

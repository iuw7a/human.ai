import { requireAdmin } from "@/lib/admin";
import { ProvidersPanel } from "@/components/admin/ProvidersPanel";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdmin();
  return <ProvidersPanel />;
}

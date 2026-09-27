import { requireAdmin } from "@/lib/admin";
import { SystemPanel } from "@/components/admin/SystemPanel";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  await requireAdmin();
  return <SystemPanel />;
}

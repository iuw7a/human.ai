import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { PagesManager } from "@/components/admin/PagesManager";

export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Page Management" sub="Markdown pages that override built-in content when published." />
      <PagesManager />
    </div>
  );
}

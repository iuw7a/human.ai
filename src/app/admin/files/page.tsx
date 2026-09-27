import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { FilesManager } from "@/components/admin/FilesManager";

export const dynamic = "force-dynamic";

export default async function AdminFilesPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="File Manager" sub="Every upload across all users, with storage usage." />
      <FilesManager />
    </div>
  );
}

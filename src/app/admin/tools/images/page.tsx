import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { ImageTool } from "@/components/admin/ImageTool";

export const dynamic = "force-dynamic";

export default async function AdminImagesPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Images" sub="Text-to-image studio (Agnes Image 2.1). Results are not stored." />
      <ImageTool />
    </div>
  );
}

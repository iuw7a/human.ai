import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { VideoTool } from "@/components/admin/VideoTool";

export const dynamic = "force-dynamic";

export default async function AdminVideoPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Video" sub="Text-to-video studio (Agnes Video 2.5, async). Results are not stored." />
      <VideoTool />
    </div>
  );
}

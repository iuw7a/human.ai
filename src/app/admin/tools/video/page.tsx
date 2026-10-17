import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { VideoTool } from "@/components/admin/VideoTool";

export const dynamic = "force-dynamic";

export default async function AdminVideoPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Video" sub="Text-to-video studio (JSON2Video narrated movie, Agnes, HF). Results are not stored." />
      <VideoTool />
    </div>
  );
}

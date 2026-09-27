import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { AnnouncementsManager } from "@/components/admin/AnnouncementsManager";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Announcements" sub="Banners and modals, shown app-wide with audience targeting." />
      <AnnouncementsManager kinds={["banner", "modal"]} />
    </div>
  );
}

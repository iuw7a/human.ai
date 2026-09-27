import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { EmailsManager } from "@/components/admin/EmailsManager";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Email Center" sub="Supabase-powered invites/resets, templates, and delivery log." />
      <EmailsManager />
    </div>
  );
}

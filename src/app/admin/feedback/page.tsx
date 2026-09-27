import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { FeedbackManager } from "@/components/admin/FeedbackManager";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Feedback Center" sub="Real votes from the chat UI. Triage to resolved." />
      <FeedbackManager />
    </div>
  );
}

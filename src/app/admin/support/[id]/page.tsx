import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/admin/ui";
import { TicketThread } from "@/components/admin/TicketThread";

export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const admin = createAdminSupabase();
  const { data: ticket } = await admin.from("support_tickets").select("*").eq("id", params.id).single();
  if (!ticket) notFound();
  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .eq("ticket_id", params.id)
    .order("created_at", { ascending: true });
  const { data: u } = await admin.auth.admin.getUserById(ticket.user_id);
  return (
    <div>
      <PageHeader
        title={ticket.subject}
        sub={`${u?.user?.email ?? ticket.user_id} · ${new Date(ticket.created_at).toLocaleString()}`}
        action={<Link href="/admin/support" className="btn-ghost border border-ink-700 text-xs">← All tickets</Link>}
      />
      <TicketThread ticketId={ticket.id} initial={messages ?? []} initialStatus={ticket.status} />
    </div>
  );
}

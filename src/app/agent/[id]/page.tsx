import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AgentView } from "@/components/AgentView";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession } from "@/lib/agent/browser";

export const dynamic = "force-dynamic";

export default async function AgentSessionPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agent");
  const s = getSession(params.id, user.id);
  if (!s) redirect("/agent");

  return (
    <AppShell>
      <AgentView sessionId={s.id} initialGoal={s.goal} autostart={s.history.length === 0 && !s.pendingApproval} />
    </AppShell>
  );
}

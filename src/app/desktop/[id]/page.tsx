import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DesktopView } from "@/components/DesktopView";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDesktopSession } from "@/lib/desktop/session";

export const dynamic = "force-dynamic";

export default async function DesktopSessionPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/desktop");
  const s = getDesktopSession(params.id, user.id);
  if (!s) redirect("/desktop");

  return (
    <AppShell>
      <DesktopView sessionId={s.id} initialGoal={s.goal} autostart={s.history.length === 0 && !s.pendingApproval} />
    </AppShell>
  );
}

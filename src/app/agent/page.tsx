import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Agent is an execution mode inside ONE Human AI conversation — not a separate chat.
 * Entry point: start on the landing chat input with Agent preselected.
 */
export default async function AgentPage({
  searchParams,
}: {
  searchParams: { goal?: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agent");
  redirect(searchParams.goal ? `/?mode=agent&goal=${encodeURIComponent(searchParams.goal)}` : "/?mode=agent");
}

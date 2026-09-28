import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Computer Use is an execution mode inside ONE Human AI conversation — not a separate chat.
 * Entry point: start on the landing chat input with Computer Use preselected.
 */
export default async function ComputerUsePage({
  searchParams,
}: {
  searchParams: { goal?: string };
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/computer-use");
  redirect(searchParams.goal ? `/?mode=computer-use&goal=${encodeURIComponent(searchParams.goal)}` : "/?mode=computer-use");
}

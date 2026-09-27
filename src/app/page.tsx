import LandingInner from "@/components/Landing";
import { AppShell } from "@/components/AppShell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <AppShell>
      <LandingInner user={user} />
    </AppShell>
  );
}

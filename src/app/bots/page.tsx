import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotsDashboard } from "@/components/BotsDashboard";
import { ProUpgrade } from "@/components/ProUpgrade";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bots");

  let isPro = false;
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }

  return <AppShell>{isPro ? <BotsDashboard /> : <ProUpgrade context="Human Bot" />}</AppShell>;
}

import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BotForm } from "@/components/BotForm";
import { ProUpgrade } from "@/components/ProUpgrade";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewBotPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bots/new");

  let isPro = false;
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }

  return (
    <AppShell>
      {isPro ? (
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-accent">Human Bot</p>
          <h1 className="mb-6 text-2xl font-black tracking-tight text-white">Create your companion</h1>
          <BotForm mode="create" />
        </div>
      ) : (
        <ProUpgrade context="The Bot Creator" />
      )}
    </AppShell>
  );
}

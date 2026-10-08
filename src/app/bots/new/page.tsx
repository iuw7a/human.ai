import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { CreatorForm } from "@/components/bots/CreatorForm";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** /bots/new — create a bot: identity, avatar, personality, knowledge, capabilities, visibility. */
export default async function NewBotPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bots/new");

  const admin = createAdminSupabase();
  let isPro = false;
  try {
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }
  if (!isPro) {
    return (
      <AppShell>
        <ProUpgrade context="Human Bot" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-white">Create Bot</h1>
        <p className="mb-8 mt-2 text-[15px] text-zinc-400">
          Give it a name, a personality and knowledge — it gets its own /username route.
        </p>
        <CreatorForm />
      </div>
    </AppShell>
  );
}

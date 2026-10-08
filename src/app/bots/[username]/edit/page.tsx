import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotForm } from "@/components/BotForm";
import { EditExtras } from "@/components/bots/EditExtras";
import { KnowledgeManager } from "@/components/bots/KnowledgeManager";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

/** /bots/[username]/edit — owner only: form + publishing + knowledge. */
export default async function BotEditPage({ params }: { params: { username: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bots/${params.username}/edit`);

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

  const bot = await getOwnedBot(params.username, user.id);
  if (!bot) notFound();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Edit {bot.name}</h1>
          <p className="mt-2 font-mono text-sm text-zinc-500">
            /{bot.slug} · {bot.visibility}
          </p>
        </div>
        <BotForm bot={bot} mode="edit" />
        <EditExtras slug={bot.slug} name={bot.name} initialVisibility={bot.visibility} initialCategory={bot.category} />
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Knowledge</h2>
          <KnowledgeManager slug={bot.slug} />
        </div>
      </div>
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { BotForm } from "@/components/BotForm";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { toBot } from "@/lib/bots";

export const dynamic = "force-dynamic";

async function loadBot(slug: string) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/bot/${slug}/customize`);
  const admin = createAdminSupabase();
  let isPro = false;
  try {
    const { data } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    isPro = data?.plan === "plus";
  } catch {
    isPro = false;
  }
  if (!isPro) return { pro: false as const };
  const { data: row } = await admin.from("bots").select("*").eq("slug", slug).single();
  if (!row || row.owner_id !== user.id) redirect("/bots");
  return { pro: true as const, bot: toBot(row) };
}

export default async function BotCustomizePage({ params }: { params: { slug: string } }) {
  const loaded = await loadBot(params.slug);
  if (!loaded.pro) {
    return (
      <AppShell>
        <ProUpgrade context="Bot customization" />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Link href={`/bot/${loaded.bot.slug}`} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
          <ArrowLeft size={13} /> Back to {loaded.bot.name}
        </Link>
        <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-widest text-accent">Customize</p>
        <h1 className="mb-6 text-2xl font-black tracking-tight text-white">{loaded.bot.name}</h1>
        <BotForm mode="edit" bot={loaded.bot} />
      </div>
    </AppShell>
  );
}

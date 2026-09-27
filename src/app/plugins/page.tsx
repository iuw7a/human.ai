import { redirect } from "next/navigation";
import { Blocks, FlaskConical } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PluginsPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plugins");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <Blocks size={19} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-white">Plugins</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Extend what Human AI can do.
            </p>
          </div>
        </div>

        <div className="card mt-6 p-6">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <FlaskConical size={13} />
            Experimental — in development
          </p>
          <p className="mt-3 text-[15px] leading-7 text-zinc-300">
            The Human AI plugin system is currently in development. The
            platform is architected plugin-ready — providers, tools, and
            capabilities are separated so plugins can dock in cleanly.
            Nothing here is functional yet, and no availability dates are
            promised.
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            There is nothing to install or enable yet. This page will list
            available plugins as soon as the first ones ship.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

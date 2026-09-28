import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AgentStarter } from "@/components/AgentStarter";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agent");

  let runs: { session_id: string; goal: string; status: string; updated_at: string }[] = [];
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("agent_runs")
      .select("session_id,goal,status,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);
    runs = (data ?? []) as typeof runs;
  } catch {
    runs = [];
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-black">
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
          <div className="w-full max-w-2xl py-10">
            <p className="mb-3 text-center text-xs font-medium uppercase tracking-widest text-accent">
              Computer Use
            </p>
            <h1 className="mb-8 text-center text-4xl font-black tracking-[0.18em] text-white sm:text-5xl">
              AGENT
            </h1>
            <AgentStarter />
            {runs.length > 0 && (
              <div className="mt-8">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Recent agent runs
                </p>
                <div className="space-y-1.5">
                  {runs.map((r) => (
                    <div key={r.session_id} className="card flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{r.goal || r.session_id}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

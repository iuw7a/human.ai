import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MemoryManager } from "@/components/MemoryManager";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function MemoryPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/memory");

  const { data } = await supabase
    .from("memories")
    .select("id,content,created_at")
    .order("created_at", { ascending: false });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
        <h1 className="text-xl font-semibold text-white">Memory</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Things Human AI should remember about you. Only visible to you.
        </p>
        <div className="mt-6">
          <MemoryManager initial={data ?? []} />
        </div>
      </div>
    </AppShell>
  );
}

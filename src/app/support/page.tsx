import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SupportCenter } from "@/components/SupportCenter";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function SupportPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 pl-14 lg:pl-4">
        <h1 className="text-xl font-semibold text-white">Support</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Open a ticket and track admin replies here.
        </p>
        <div className="mt-6">
          <SupportCenter />
        </div>
      </div>
    </AppShell>
  );
}

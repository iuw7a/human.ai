import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountActions } from "@/components/AccountActions";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
        <h1 className="text-xl font-semibold text-white">Account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Technical settings for your Human AI account.
        </p>
        <div className="mt-6">
          <AccountActions email={user.email ?? ""} />
        </div>
      </div>
    </AppShell>
  );
}

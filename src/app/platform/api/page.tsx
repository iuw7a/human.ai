import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ApiKeysClient } from "@/components/platform/ApiKeysClient";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** /platform/api — personal API keys for the Human AI API. */
export default async function PlatformApiPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/platform/api");

  return (
    <PlatformShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-white">API Keys</h1>
        <p className="mb-8 mt-2 text-[15px] text-zinc-400">
          Call Human AI from your own apps and scripts.
        </p>
        <ApiKeysClient />
      </div>
    </PlatformShell>
  );
}

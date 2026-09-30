import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProUpgrade } from "@/components/ProUpgrade";
import { ApproveForm } from "@/components/DesktopApprove";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { userIsPro } from "@/lib/bots";

export const dynamic = "force-dynamic";

export default async function DesktopApprovePage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const code = (searchParams.code ?? "").trim();
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/desktop/approve${code ? `?code=${encodeURIComponent(code)}` : ""}`);
  if (!(await userIsPro(user.id))) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-md px-4 py-16">
          <ProUpgrade context="Human Bot" />
        </div>
      </AppShell>
    );
  }

  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("desktop_device_codes")
    .select("status,expires_at")
    .eq("code", code)
    .maybeSingle();
  const valid =
    !!row && row.status === "pending" && new Date(row.expires_at).getTime() > Date.now();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Connect desktop app</h1>
        <p className="mb-6 text-center text-sm text-zinc-400">
          Approve the login code shown in the Human AI desktop app.
        </p>
        {valid ? (
          <ApproveForm code={code} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
            <p className="font-semibold text-white">Code expired or unknown</p>
            <p className="mt-2 text-sm text-zinc-400">
              Start a new login in the desktop app to get a fresh code.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  let message = "Human AI is briefly down for maintenance. Please check back soon.";
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "maintenance_message")
      .single();
    if (data?.value) message = data.value;
  } catch {
    // fallback message
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-ink-700">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-white">Under maintenance</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">{message}</p>
    </div>
  );
}

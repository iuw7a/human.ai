import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: feature flags (values only, safe to expose). */
export async function GET() {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("feature_flags").select("key,enabled");
    return Response.json({ flags: Object.fromEntries((data ?? []).map((f) => [f.key, !!f.enabled])) });
  } catch {
    return Response.json({ flags: {} });
  }
}

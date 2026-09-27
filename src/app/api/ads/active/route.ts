import { createAdminSupabase } from "@/lib/supabase/server";
import { isEnabled } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: highest-priority currently active ad (DB-backed, never hardcoded). */
export async function GET() {
  try {
    if (!(await isEnabled("ads"))) return Response.json({ ad: null });
    const admin = createAdminSupabase();
    const now = new Date().toISOString();
    const { data } = await admin
      .from("ads")
      .select("id,title,description,image_url,destination_url,placement")
      .eq("active", true)
      .or(`starts_at.is.null,starts_at.lte.${now},ends_at.is.null,ends_at.gte.${now}`)
      .order("priority", { ascending: false })
      .limit(1)
      .single();
    return Response.json({ ad: data ?? null });
  } catch {
    return Response.json({ ad: null });
  }
}

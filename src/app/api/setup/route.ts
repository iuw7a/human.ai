import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/setup — is bootstrap still available? */
export async function GET() {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (error) {
      return Response.json({
        ready: false,
        reason: "Database tables missing. Run supabase/schema.sql and supabase/admin_schema.sql first.",
      });
    }
    return Response.json({ ready: (data ?? []).length === 0 });
  } catch {
    return Response.json({ ready: false, reason: "Database unreachable." });
  }
}

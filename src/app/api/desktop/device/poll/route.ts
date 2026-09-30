import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/desktop/device/poll?code= — pending | approved | denied | expired. Public by unguessable code. */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) return Response.json({ error: "Code required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("desktop_device_codes")
    .select("status,expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!row) return Response.json({ status: "expired" });
  if (row.status === "pending" && new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("desktop_device_codes").update({ status: "expired" }).eq("code", code);
    return Response.json({ status: "expired" });
  }
  return Response.json({ status: row.status });
}

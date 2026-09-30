import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/desktop/device/approve {code, approve} — browser session (Pro) approves/denies a desktop login. */
export async function POST(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { code?: string; approve?: boolean } | null;
  const code = (b?.code ?? "").trim();
  if (!code) return Response.json({ error: "Code required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { data: row } = await admin
    .from("desktop_device_codes")
    .select("status,expires_at")
    .eq("code", code)
    .maybeSingle();
  if (!row || row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "Code expired or unknown." }, { status: 410 });
  }
  const patch = b?.approve
    ? { status: "approved", user_id: user.id, decided_at: new Date().toISOString() }
    : { status: "denied", decided_at: new Date().toISOString() };
  const { error } = await admin.from("desktop_device_codes").update(patch).eq("code", code).eq("status", "pending");
  if (error) return Response.json({ error: "Could not decide." }, { status: 500 });
  return Response.json({ ok: true, approved: !!b?.approve });
}

import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** POST /api/security/event {type: login|login_failed|logout, email?} — client-reported auth events */
export async function POST(req: NextRequest) {
  try {
    const { type, email } = (await req.json()) as { type?: string; email?: string };
    if (!["login", "login_failed", "logout"].includes(type ?? "")) {
      return Response.json({ error: "Invalid type." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    let user_id: string | null = null;
    if (email) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      user_id = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
    }
    await admin.from("auth_events").insert({
      user_id,
      email: (email ?? "").slice(0, 160),
      type,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true });
  }
}

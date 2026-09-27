import { NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/support — own tickets */
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const { data } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return Response.json({ rows: data ?? [] });
}

/** POST /api/support {subject, body} — open ticket */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { subject, body } = (await req.json()) as { subject?: string; body?: string };
    if (!subject?.trim() || !body?.trim()) {
      return Response.json({ error: "Subject and message required." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({ user_id: user.id, subject: subject.trim().slice(0, 160) })
      .select("id")
      .single();
    if (error) throw error;
    await admin.from("support_messages").insert({
      ticket_id: ticket.id, sender: "user", body: body.trim().slice(0, 5000),
    });
    return Response.json({ ok: true, id: ticket.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

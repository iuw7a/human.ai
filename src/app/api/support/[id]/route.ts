import { NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/support/[id] — own ticket + messages */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const admin = createAdminSupabase();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!ticket) return Response.json({ error: "Not found." }, { status: 404 });
  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .eq("ticket_id", params.id)
    .order("created_at", { ascending: true });
  return Response.json({ ticket, messages: messages ?? [] });
}

/** POST /api/support/[id] {body} — user reply */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { body } = (await req.json()) as { body?: string };
    if (!body?.trim()) return Response.json({ error: "Message required." }, { status: 400 });
    const admin = createAdminSupabase();
    const { data: ticket } = await admin
      .from("support_tickets")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();
    if (!ticket) return Response.json({ error: "Not found." }, { status: 404 });
    await admin.from("support_messages").insert({
      ticket_id: params.id, sender: "user", body: body.trim().slice(0, 5000),
    });
    await admin.from("support_tickets").update({ updated_at: new Date().toISOString(), status: "open" }).eq("id", params.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/emails — templates + send log */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const [templates, logs] = await Promise.all([
    admin.from("email_templates").select("*").order("name"),
    admin.from("email_logs").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  return Response.json({ templates: templates.data ?? [], logs: logs.data ?? [] });
}

/** POST /api/admin/emails {kind, ...} — kinds: template | invite | reset */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as { kind?: string; name?: string; subject?: string; body?: string; email?: string };
    const admin = createAdminSupabase();

    if (b.kind === "template") {
      if (!b.name) return Response.json({ error: "name required." }, { status: 400 });
      await admin.from("email_templates").upsert(
        { name: b.name.slice(0, 80), subject: (b.subject ?? "").slice(0, 200), body: (b.body ?? "").slice(0, 10000) },
        { onConflict: "name" }
      );
      await logAdminAction(adminUser.id, "saved email template", b.name);
      return Response.json({ ok: true });
    }

    if (b.kind === "invite" || b.kind === "reset") {
      if (!b.email || !b.email.includes("@")) {
        return Response.json({ error: "valid email required." }, { status: 400 });
      }
      try {
        if (b.kind === "invite") {
          const { error } = await admin.auth.admin.inviteUserByEmail(b.email);
          if (error) throw error;
        } else {
          const { error } = await admin.auth.resetPasswordForEmail(b.email);
          if (error) throw error;
        }
        await admin.from("email_logs").insert({
          to_email: b.email, subject: b.kind === "invite" ? "Invitation" : "Password reset",
          status: "sent", sent_by: adminUser.id,
        });
        await logAdminAction(adminUser.id, `sent ${b.kind} email`, b.email);
        return Response.json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed.";
        await admin.from("email_logs").insert({
          to_email: b.email, subject: b.kind, status: "failed", error: msg.slice(0, 1000), sent_by: adminUser.id,
        });
        return Response.json({ error: msg }, { status: 500 });
      }
    }
    return Response.json({ error: "Unknown kind." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

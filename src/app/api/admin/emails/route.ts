import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendHtml } from "@/lib/email";

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

/** POST /api/admin/emails {kind, ...} — kinds: template | invite | reset | broadcast.
 *  broadcast {to?: string[] | "all", subject, html}: custom HTML to explicit
 *  recipients or every profiles email. Sequential, logged per recipient. */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as { kind?: string; name?: string; subject?: string; body?: string; email?: string; to?: unknown; html?: string };
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
    if (b.kind === "broadcast") {
      const subject = (b.subject ?? "").trim().slice(0, 200);
      const html = typeof b.html === "string" ? b.html : "";
      if (!subject || !html) {
        return Response.json({ error: "subject + html required." }, { status: 400 });
      }
      let recipients: string[] = [];
      if (b.to === "all") {
        const { data } = await admin.from("profiles").select("email").limit(5000);
        recipients = [...new Set((data ?? []).map((p) => String(p.email ?? "").trim()).filter((e) => e.includes("@")))];
      } else if (Array.isArray(b.to)) {
        recipients = [...new Set(b.to.map((e) => String(e ?? "").trim()).filter((e) => e.includes("@")))].slice(0, 5000);
      } else {
        return Response.json({ error: 'to must be "all" or an email array.' }, { status: 400 });
      }
      if (recipients.length === 0) {
        return Response.json({ error: "No recipients." }, { status: 400 });
      }
      const sent: string[] = [];
      const failed: { email: string; error: string }[] = [];
      for (const email of recipients) {
        try {
          await sendHtml({ to: email, subject, html });
          sent.push(email);
          await admin.from("email_logs").insert({
            to_email: email, subject, status: "sent", sent_by: adminUser.id,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Send failed.";
          failed.push({ email, error: msg.slice(0, 500) });
          await admin.from("email_logs").insert({
            to_email: email, subject, status: "failed", error: msg.slice(0, 1000), sent_by: adminUser.id,
          });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      await logAdminAction(adminUser.id, "broadcast email", subject, { sent: sent.length, failed: failed.length });
      return Response.json({ ok: true, sent: sent.length, failed });
    }
    return Response.json({ error: "Unknown kind." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

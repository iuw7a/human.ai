import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** PATCH /api/admin/users/[id] — ban/unban/disable/enable/plan/role/notes */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const targetId = params.id;

  try {
    const body = (await req.json()) as {
      op?: "ban" | "unban" | "disable" | "enable" | "plan" | "role" | "note";
      plan?: "free" | "plus";
      role?: string;
      note?: string;
    };
    const admin = createAdminSupabase();
    const { op } = body;
    if (!op) return Response.json({ error: "Missing op." }, { status: 400 });
    if (targetId === adminUser.id && (op === "ban" || op === "disable")) {
      return Response.json({ error: "You cannot ban or disable yourself." }, { status: 400 });
    }

    if (op === "ban") {
      const { error } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "876000h",
      });
      if (error) throw error;
      await admin.from("profiles").update({ status: "banned", banned_at: new Date().toISOString() }).eq("id", targetId);
      await logAdminAction(adminUser.id, "banned user", targetId);
    } else if (op === "unban") {
      const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
      if (error) throw error;
      await admin.from("profiles").update({ status: "active", banned_at: null }).eq("id", targetId);
      await logAdminAction(adminUser.id, "unbanned user", targetId);
    } else if (op === "disable" || op === "enable") {
      const status = op === "disable" ? "disabled" : "active";
      await admin.from("profiles").update({ status }).eq("id", targetId);
      await logAdminAction(adminUser.id, `${op}d account`, targetId);
    } else if (op === "plan") {
      const plan = body.plan === "plus" ? "plus" : "free";
      const { data: prev } = await admin.from("profiles").select("plan").eq("id", targetId).single();
      await admin.from("profiles").update({ plan }).eq("id", targetId);
      await admin.from("subscription_events").insert({
        user_id: targetId,
        from_plan: prev?.plan ?? "free",
        to_plan: plan,
        changed_by: adminUser.id,
      });
      await logAdminAction(adminUser.id, `${plan === "plus" ? "granted Plus to user" : "removed Plus from user"}`, targetId);
    } else if (op === "role") {
      const allowed = ["user", "editor", "support", "admin", "super_admin"];
      if (!allowed.includes(body.role ?? "")) {
        return Response.json({ error: "Invalid role." }, { status: 400 });
      }
      if (adminUser.role !== "super_admin" && (body.role === "super_admin" || body.role === "admin")) {
        return Response.json({ error: "Only super_admin can grant admin roles." }, { status: 403 });
      }
      await admin.from("profiles").update({ role: body.role }).eq("id", targetId);
      await logAdminAction(adminUser.id, `set role ${body.role} for user`, targetId);
    } else if (op === "note") {
      await admin.from("profiles").update({ admin_notes: (body.note ?? "").slice(0, 2000) }).eq("id", targetId);
      await logAdminAction(adminUser.id, "updated admin note for user", targetId);
    } else {
      return Response.json({ error: "Unknown op." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 500 }
    );
  }
}

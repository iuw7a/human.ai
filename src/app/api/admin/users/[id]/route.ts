import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { normalizePlan, normalizeSource } from "@/lib/subscriptions";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createAdminSupabase>;

async function insertEvent(admin: AdminClient, row: Record<string, unknown>) {
  const full = await admin.from("subscription_events").insert(row);
  if (!full.error) return;
  const { user_id, from_plan, to_plan, changed_by } = row;
  await admin.from("subscription_events").insert({ user_id, from_plan, to_plan, changed_by });
}

async function updateProfileSub(admin: AdminClient, userId: string, patch: Record<string, unknown>) {
  const full = await admin.from("profiles").update(patch).eq("id", userId);
  if (!full.error) return full;
  if (typeof patch.plan === "string") {
    return admin.from("profiles").update({ plan: patch.plan }).eq("id", userId);
  }
  return full;
}

/** PATCH /api/admin/users/[id] — ban/unban/disable/enable/plan/role/notes/suspend/restore/revoke */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const targetId = params.id;

  try {
    const body = (await req.json()) as {
      op?: "ban" | "unban" | "disable" | "enable" | "plan" | "role" | "note" | "suspend" | "restore" | "revoke";
      plan?: string;
      source?: string;
      duration_days?: number;
      expires_at?: string;
      provider_ref?: string;
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
      const plan = normalizePlan(body.plan);
      let source = normalizeSource(body.source);
      if (!source) source = plan === "free" ? null : ("admin_grant" as const);
      if (source === "payment" && !body.provider_ref?.trim()) {
        return Response.json({ error: "Payment source requires provider_ref." }, { status: 400 });
      }
      let expiresAt: string | null = null;
      if (plan !== "free") {
        if (typeof body.expires_at === "string" && body.expires_at.trim()) {
          const d = new Date(body.expires_at);
          if (!Number.isNaN(d.getTime())) expiresAt = d.toISOString();
        } else if (typeof body.duration_days === "number" && body.duration_days > 0) {
          expiresAt = new Date(Date.now() + Math.min(body.duration_days, 3650) * 86400000).toISOString();
        }
      }
      const now = new Date().toISOString();
      const { data: prev } = await admin.from("profiles").select("plan").eq("id", targetId).single();
      await updateProfileSub(admin, targetId, {
        plan,
        subscription_status: plan === "free" ? "free" : "active",
        subscription_source: source,
        subscription_starts_at: plan === "free" ? null : now,
        subscription_expires_at: expiresAt,
        subscription_provider_ref: body.provider_ref?.trim().slice(0, 200) || null,
        subscription_granted_by: source === "admin_grant" ? adminUser.id : null,
      });
      await insertEvent(admin, {
        user_id: targetId,
        from_plan: prev?.plan ?? "free",
        to_plan: plan,
        status: plan === "free" ? "free" : "active",
        source,
        starts_at: plan === "free" ? null : now,
        expires_at: expiresAt,
        provider_ref: body.provider_ref?.trim().slice(0, 200) || null,
        changed_by: adminUser.id,
      });
      await logAdminAction(
        adminUser.id,
        source === "admin_grant" ? `granted ${plan} (admin grant)` : `set plan ${plan}`,
        targetId,
        { plan, source }
      );
    } else if (op === "suspend") {
      const { data: prev } = await admin.from("profiles").select("plan,subscription_source").eq("id", targetId).single();
      await updateProfileSub(admin, targetId, { subscription_status: "suspended" });
      await insertEvent(admin, {
        user_id: targetId,
        from_plan: prev?.plan ?? "free",
        to_plan: prev?.plan ?? "free",
        status: "suspended",
        source: (prev as { subscription_source?: string | null } | null)?.subscription_source ?? null,
        changed_by: adminUser.id,
      });
      await logAdminAction(adminUser.id, "suspended subscription", targetId);
    } else if (op === "restore") {
      const { data: prev } = await admin.from("profiles").select("plan,subscription_source").eq("id", targetId).single();
      await updateProfileSub(admin, targetId, { subscription_status: "active" });
      await insertEvent(admin, {
        user_id: targetId,
        from_plan: prev?.plan ?? "free",
        to_plan: prev?.plan ?? "free",
        status: "active",
        source: (prev as { subscription_source?: string | null } | null)?.subscription_source ?? null,
        changed_by: adminUser.id,
      });
      await logAdminAction(adminUser.id, "restored subscription", targetId);
    } else if (op === "revoke") {
      const { data: prev } = await admin.from("profiles").select("plan").eq("id", targetId).single();
      await updateProfileSub(admin, targetId, {
        plan: "free",
        subscription_status: "free",
        subscription_source: null,
        subscription_starts_at: null,
        subscription_expires_at: null,
        subscription_provider_ref: null,
        subscription_granted_by: null,
      });
      await insertEvent(admin, {
        user_id: targetId,
        from_plan: prev?.plan ?? "free",
        to_plan: "free",
        status: "free",
        source: "admin_grant",
        changed_by: adminUser.id,
        metadata: { revoked: true },
      });
      await logAdminAction(adminUser.id, "revoked subscription (admin grant)", targetId);
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

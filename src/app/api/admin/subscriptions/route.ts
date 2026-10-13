import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { normalizePlan, normalizeStatus, normalizeSource } from "@/lib/subscriptions";

export const runtime = "nodejs";

function toExpiry(durationDays?: unknown, expiresAt?: unknown): string | null {
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const d = new Date(expiresAt);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof durationDays === "number" && Number.isFinite(durationDays) && durationDays > 0) {
    return new Date(Date.now() + Math.min(durationDays, 3650) * 86400000).toISOString();
  }
  return null;
}

type AdminClient = ReturnType<typeof createAdminSupabase>;

/** Insert a subscription event; falls back to legacy columns pre-migration. */
async function insertEvent(admin: AdminClient, row: Record<string, unknown>) {
  const full = await admin.from("subscription_events").insert(row);
  if (!full.error) return;
  const { user_id, from_plan, to_plan, changed_by } = row;
  await admin.from("subscription_events").insert({ user_id, from_plan, to_plan, changed_by });
}

/** Update a profile's subscription; falls back to plan-only pre-migration. */
async function updateProfileSub(admin: AdminClient, userId: string, patch: Record<string, unknown>) {
  const full = await admin.from("profiles").update(patch).eq("id", userId);
  if (!full.error) return;
  if (typeof patch.plan === "string") {
    await admin.from("profiles").update({ plan: patch.plan }).eq("id", userId);
  }
}

/** GET /api/admin/subscriptions?q=&plan=&status=&source= — full subscription data + history */
export async function GET(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const plan = req.nextUrl.searchParams.get("plan") ?? "all";
  const status = req.nextUrl.searchParams.get("status") ?? "all";
  const source = req.nextUrl.searchParams.get("source") ?? "all";
  try {
    const admin = createAdminSupabase();
    let profiles: Record<string, unknown>[] | null = null;
    const full = await admin
      .from("profiles")
      .select(
        "id,name,email,avatar_url,plan,status,subscription_status,subscription_source,subscription_starts_at,subscription_expires_at,subscription_provider_ref,subscription_granted_by,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!full.error) {
      profiles = (full.data ?? []) as Record<string, unknown>[];
    } else {
      // Pre-migration fallback: legacy columns only.
      const legacy = await admin
        .from("profiles")
        .select("id,name,email,avatar_url,plan,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (legacy.error) throw legacy.error;
      profiles = ((legacy.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        subscription_status: r.plan === "free" ? "free" : "active",
        subscription_source: null,
        subscription_starts_at: null,
        subscription_expires_at: null,
        subscription_provider_ref: null,
        subscription_granted_by: null,
      }));
    }
    let rows = (profiles ?? []) as {
      id: string; name?: string | null; email?: string | null; plan?: string;
      subscription_status?: string; subscription_source?: string | null;
    }[];
    if (plan !== "all") rows = rows.filter((r) => (r.plan ?? "free") === plan);
    if (status !== "all") rows = rows.filter((r) => (r.subscription_status ?? "free") === status);
    if (source !== "all") rows = rows.filter((r) => (r.subscription_source ?? "") === source);
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }
    const { data: events } = await admin
      .from("subscription_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(150);
    // Resolve changer emails for history display.
    const changerIds = [...new Set((events ?? []).map((e) => e.changed_by).filter(Boolean))].slice(0, 50) as string[];
    let changerMap: Record<string, string> = {};
    if (changerIds.length > 0) {
      const { data: changers } = await admin.from("profiles").select("id,email,name").in("id", changerIds);
      changerMap = Object.fromEntries((changers ?? []).map((c) => [c.id, c.email ?? c.name ?? c.id.slice(0, 8)]));
    }
    const enriched = (events ?? []).map((e) => ({
      ...e,
      changed_by_email: e.changed_by ? (changerMap[e.changed_by] ?? String(e.changed_by).slice(0, 8)) : null,
    }));
    return Response.json({ rows: rows.slice(0, 300), total: rows.length, events: enriched });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/**
 * POST /api/admin/subscriptions — assign/upgrade/downgrade/suspend/restore/revoke.
 * Body: { user_id, plan: free|plus|pro, status?: free|active|expired|suspended,
 *   source?: payment|admin_grant|redeem_code|promotion|external_provider,
 *   duration_days?: number, expires_at?: string, provider_ref?: string,
 *   action?: assign|suspend|restore|revoke }
 * Admin grants are always recorded as admin_grant unless source=payment with provider_ref.
 */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      user_id?: string;
      plan?: string;
      status?: string;
      source?: string;
      duration_days?: number;
      expires_at?: string;
      provider_ref?: string;
      action?: string;
    };
    const userId = b.user_id?.trim();
    if (!userId) return Response.json({ error: "user_id required." }, { status: 400 });
    const action = b.action ?? "assign";

    const admin = createAdminSupabase();
    let prev: { plan?: string; subscription_status?: string | null; subscription_source?: string | null } | null = null;
    const prevFull = await admin
      .from("profiles")
      .select("plan,subscription_status,subscription_source")
      .eq("id", userId)
      .single();
    if (!prevFull.error && prevFull.data) {
      prev = prevFull.data;
    } else {
      const legacy = await admin.from("profiles").select("plan").eq("id", userId).single();
      if (legacy.error || !legacy.data) return Response.json({ error: "User not found." }, { status: 404 });
      prev = { ...(legacy.data as object), subscription_status: null, subscription_source: null };
    }
    if (!prev) return Response.json({ error: "User not found." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "suspend") {
      await updateProfileSub(admin, userId, { subscription_status: "suspended" });
      await insertEvent(admin, {
        user_id: userId,
        from_plan: prev.plan ?? "free",
        to_plan: prev.plan ?? "free",
        status: "suspended",
        source: prev.subscription_source ?? null,
        changed_by: adminUser.id,
      });
      await logAdminAction(adminUser.id, "suspended subscription", userId);
      return Response.json({ ok: true, action: "suspended" });
    }

    if (action === "restore") {
      // If expired, restoring without new expiry keeps past date — admin should set duration too.
      await updateProfileSub(admin, userId, { subscription_status: "active" });
      await insertEvent(admin, {
        user_id: userId,
        from_plan: prev.plan ?? "free",
        to_plan: prev.plan ?? "free",
        status: "active",
        source: prev.subscription_source ?? null,
        changed_by: adminUser.id,
      });
      await logAdminAction(adminUser.id, "restored subscription", userId);
      return Response.json({ ok: true, action: "restored" });
    }

    if (action === "revoke") {
      // Revoke an admin grant: back to free, status free, source kept in history only.
      await updateProfileSub(admin, userId, {
        plan: "free",
        subscription_status: "free",
        subscription_source: null,
        subscription_starts_at: null,
        subscription_expires_at: null,
        subscription_provider_ref: null,
        subscription_granted_by: null,
      });
      await insertEvent(admin, {
        user_id: userId,
        from_plan: prev.plan ?? "free",
        to_plan: "free",
        status: "free",
        source: "admin_grant",
        changed_by: adminUser.id,
        metadata: { revoked: true },
      });
      await logAdminAction(adminUser.id, "revoked subscription (admin grant)", userId, {
        from_plan: prev.plan,
      });
      return Response.json({ ok: true, action: "revoked" });
    }

    // Default: assign / upgrade / downgrade.
    const plan = normalizePlan(b.plan);
    let status = b.status !== undefined ? normalizeStatus(b.status) : plan === "free" ? "free" : "active";
    let source = normalizeSource(b.source);
    if (!source) source = plan === "free" ? null : ("admin_grant" as const);
    // Payment source requires a verified provider reference — never claim payment otherwise.
    if (source === "payment" && !b.provider_ref?.trim()) {
      return Response.json(
        { error: "Payment source requires provider_ref (verified payment reference)." },
        { status: 400 }
      );
    }
    const expiresAt = plan === "free" ? null : toExpiry(b.duration_days, b.expires_at);
    // Past expiry means the subscription is immediately expired.
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) status = "expired";

    await updateProfileSub(admin, userId, {
      plan,
      subscription_status: status,
      subscription_source: source,
      subscription_starts_at: plan === "free" ? null : now,
      subscription_expires_at: expiresAt,
      subscription_provider_ref: b.provider_ref?.trim().slice(0, 200) || null,
      subscription_granted_by: source === "admin_grant" ? adminUser.id : null,
    });
    await insertEvent(admin, {
      user_id: userId,
      from_plan: prev.plan ?? "free",
      to_plan: plan,
      status,
      source,
      starts_at: plan === "free" ? null : now,
      expires_at: expiresAt,
      provider_ref: b.provider_ref?.trim().slice(0, 200) || null,
      changed_by: adminUser.id,
    });
    await logAdminAction(
      adminUser.id,
      source === "admin_grant"
        ? `granted ${plan} (admin grant)`
        : `set plan ${plan} (source: ${source ?? "none"})`,
      userId,
      { plan, status, source, expires_at: expiresAt }
    );
    return Response.json({ ok: true, plan, status, source, expires_at: expiresAt });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getEntitlements, ACCESS_LEVELS, PLANS } from "@/lib/subscriptions";

export const runtime = "nodejs";

/** GET /api/admin/plan-rules — current plan -> access-level mapping. */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  return Response.json({ rules: await getEntitlements(), plans: PLANS, accessLevels: ACCESS_LEVELS });
}

/** PUT /api/admin/plan-rules {plan, access_levels[]} — admin-configurable entitlements. */
export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as { plan?: string; access_levels?: unknown };
    if (!b.plan || !(PLANS as readonly string[]).includes(b.plan)) {
      return Response.json({ error: `plan must be one of: ${PLANS.join(" | ")}.` }, { status: 400 });
    }
    if (!Array.isArray(b.access_levels) || b.access_levels.length === 0) {
      return Response.json({ error: "access_levels must be a non-empty array." }, { status: 400 });
    }
    const levels = [...new Set(b.access_levels.map(String))].filter((x) =>
      (ACCESS_LEVELS as readonly string[]).includes(x)
    );
    if (levels.length === 0) return Response.json({ error: "No valid access levels." }, { status: 400 });
    // Free must always keep light; higher tiers must include all lower granted levels implicitly via model checks.
    if (b.plan === "free" && !levels.includes("light")) {
      return Response.json({ error: "Free plan must include light." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    const { error } = await admin
      .from("plan_access_rules")
      .upsert({ plan: b.plan, access_levels: levels, updated_at: new Date().toISOString() });
    if (error) throw error;
    await logAdminAction(adminUser.id, `updated plan rules for ${b.plan}`, b.plan, { access_levels: levels });
    return Response.json({ ok: true, plan: b.plan, access_levels: levels });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

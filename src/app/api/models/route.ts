import { createServerSupabase } from "@/lib/supabase/server";
import { listDbModels } from "@/lib/admin";
import { getEffectiveSubscription, canAccessModel } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/models — enabled models for pickers (white-label: no provider internals).
 * When authenticated, each model carries `allowed` for the current subscription.
 * The server remains the source of truth — the frontend must not treat this
 * list as authorization.
 */
export async function GET() {
  const models = await listDbModels();
  let allowedSet: Set<string> | null = null;
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const sub = await getEffectiveSubscription(user.id);
      allowedSet = new Set(
        models.filter((m) => m.enabled && canAccessModel(sub, m)).map((m) => m.id)
      );
    }
  } catch {
    allowedSet = null;
  }
  return Response.json({
    models: models
      .filter((m) => m.enabled)
      .sort((a, b) => a.sort - b.sort)
      .map((m) => ({
        id: m.id,
        name: m.name,
        vision: m.vision,
        plan: m.plan,
        access_level: m.access_level,
        allowed: allowedSet ? allowedSet.has(m.id) : undefined,
      })),
  });
}

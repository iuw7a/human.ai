import { createServerSupabase } from "@/lib/supabase/server";
import { getEffectiveSubscription } from "@/lib/subscriptions";
import { allowedModelsFor } from "@/lib/ai-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/subscription — current user's plan, source, dates and allowed models. */
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const sub = await getEffectiveSubscription(user.id);
    const allowed = await allowedModelsFor(sub);
    return Response.json({
      plan: sub.plan,
      subscriptionStatus: sub.subscriptionStatus,
      source: sub.source,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      accessLevels: sub.accessLevels,
      hasPremium: sub.hasPremium,
      expired: sub.expired,
      suspended: sub.suspended,
      models: allowed.map((m) => ({
        id: m.id,
        name: m.name,
        vision: m.vision,
        plan: m.plan,
        access_level: m.access_level,
      })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

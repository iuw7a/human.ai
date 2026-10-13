import { getAdmin } from "@/lib/admin";
import { listProviders, listRegistryModels } from "@/lib/ai-registry";
import { getEntitlements } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/providers — providers + models + connection status + tier access.
 * Never exposes secret API keys.
 */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const [providers, models, entitlements] = await Promise.all([
      listProviders(true),
      listRegistryModels(),
      getEntitlements(),
    ]);
    return Response.json({
      providers: providers.map((p) => ({
        key: p.key,
        label: p.label,
        configured: p.configured,
        baseUrl: p.baseUrl,
        reachable: p.reachable,
        detail: p.detail,
        modelCount: p.modelCount,
      })),
      models: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        providerModelId: m.providerModelId,
        vision: m.vision,
        streaming: m.streaming,
        enabled: m.enabled,
        plan: m.plan,
        access_level: m.access_level,
        allowedPlans: m.allowedPlans,
        is_default: m.is_default,
      })),
      entitlements,
      note: "API keys are server-side only and never returned by this endpoint.",
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

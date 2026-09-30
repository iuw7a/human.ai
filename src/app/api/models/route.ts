import { listDbModels } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/models — enabled models for pickers (white-label: no provider internals). */
export async function GET() {
  const models = await listDbModels();
  return Response.json({
    models: models
      .filter((m) => m.enabled)
      .sort((a, b) => a.sort - b.sort)
      .map((m) => ({ id: m.id, name: m.name, vision: m.vision, plan: m.plan })),
  });
}

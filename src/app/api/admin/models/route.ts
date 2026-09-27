import { NextRequest } from "next/server";
import { getAdmin, logAdminAction, listDbModels } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/models — DB models (seeded from code registry) */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  return Response.json({ models: await listDbModels() });
}

/** POST /api/admin/models — add model */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      slug?: string; name?: string; provider?: string; provider_model_id?: string;
      vision?: boolean; plan?: string;
    };
    if (!b.slug || !b.provider_model_id || !b.name) {
      return Response.json({ error: "slug, name and provider_model_id required." }, { status: 400 });
    }
    const slug = b.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
    const admin = createAdminSupabase();
    const { error } = await admin.from("admin_models").insert({
      slug,
      name: b.name.slice(0, 80),
      provider: "nvidia",
      provider_model_id: b.provider_model_id.slice(0, 160),
      vision: b.vision !== false,
      enabled: true,
      plan: b.plan === "plus" ? "plus" : "free",
      sort: 99,
      is_default: false,
    });
    if (error) throw error;
    await logAdminAction(adminUser.id, "added model", slug, { provider_model_id: b.provider_model_id });
    return Response.json({ ok: true, slug });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** PUT /api/admin/models {slug, ...fields} — update; setting is_default clears others */
export async function PUT(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as {
      slug?: string; name?: string; provider_model_id?: string; vision?: boolean;
      enabled?: boolean; plan?: string; sort?: number; is_default?: boolean;
    };
    if (!b.slug) return Response.json({ error: "slug required." }, { status: 400 });
    const admin = createAdminSupabase();
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name.slice(0, 80);
    if (b.provider_model_id !== undefined) patch.provider_model_id = b.provider_model_id.slice(0, 160);
    if (b.vision !== undefined) patch.vision = !!b.vision;
    if (b.enabled !== undefined) patch.enabled = !!b.enabled;
    if (b.plan !== undefined) patch.plan = b.plan === "plus" ? "plus" : "free";
    if (b.sort !== undefined) patch.sort = Number(b.sort) || 0;
    if (b.is_default !== undefined) patch.is_default = !!b.is_default;
    if (patch.is_default) {
      await admin.from("admin_models").update({ is_default: false }).neq("slug", b.slug);
    }
    const { error } = await admin.from("admin_models").update(patch).eq("slug", b.slug);
    if (error) throw error;
    await logAdminAction(adminUser.id, "updated model", b.slug, patch);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** DELETE /api/admin/models?slug= — remove (never the last enabled model) */
export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("admin_models").select("slug,enabled").eq("enabled", true);
    if ((data ?? []).length <= 1 && (data ?? []).some((m) => m.slug === slug)) {
      return Response.json({ error: "Cannot delete the last enabled model." }, { status: 400 });
    }
    await admin.from("admin_models").delete().eq("slug", slug);
    await logAdminAction(adminUser.id, "deleted model", slug);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/admin/pages | POST {slug,title,content_md,published} | PUT | DELETE ?slug= */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data } = await admin.from("site_pages").select("*").order("slug");
  return Response.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const b = (await req.json()) as { slug?: string; title?: string; content_md?: string; published?: boolean };
    if (!b.slug || !b.title) return Response.json({ error: "slug and title required." }, { status: 400 });
    const admin = createAdminSupabase();
    await admin.from("site_pages").upsert(
      {
        slug: b.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48),
        title: b.title.slice(0, 160),
        content_md: (b.content_md ?? "").slice(0, 50000),
        published: !!b.published,
      },
      { onConflict: "slug" }
    );
    await logAdminAction(adminUser.id, "saved CMS page", b.slug);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const admin = createAdminSupabase();
  await admin.from("site_pages").delete().eq("slug", slug);
  await logAdminAction(adminUser.id, "deleted CMS page", slug);
  return Response.json({ ok: true });
}

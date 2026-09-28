import { NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { listServers } from "@/lib/mcp/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mcp/servers?q=&category= — public catalog + connection counts + my connections */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const category = req.nextUrl.searchParams.get("category") ?? "all";

    const servers = await listServers();

    // Real popularity: actual connection counts (no fake numbers).
    const admin = createAdminSupabase();
    const { data: conns } = await admin.from("mcp_connections").select("server_id").eq("status", "connected");
    const counts = new Map<string, number>();
    for (const c of conns ?? []) {
      counts.set(c.server_id, (counts.get(c.server_id) ?? 0) + 1);
    }

    // My connections (if logged in).
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let mine = new Map<string, { status: string }>();
    if (user) {
      const { data } = await admin
        .from("mcp_connections")
        .select("server_id,status")
        .eq("user_id", user.id);
      mine = new Map((data ?? []).map((c) => [c.server_id, { status: c.status }]));
    }

    let list = servers.map((s) => ({
      ...s,
      connections: counts.get(s.id) ?? 0,
      myStatus: mine.get(s.id)?.status ?? null,
    }));
    if (category !== "all") list = list.filter((s) => s.category === category);
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
      );
    }
    const categories = [...new Set(servers.map((s) => s.category))].sort();
    const featured = servers.filter((s) => s.featured);
    return Response.json({ servers: list, categories, featured });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Catalog unavailable." },
      { status: 500 }
    );
  }
}

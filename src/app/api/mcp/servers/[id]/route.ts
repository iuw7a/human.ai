import { NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { getServer } from "@/lib/mcp/catalog";
import { McpClient } from "@/lib/mcp/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/mcp/servers/[id] — detail + live tools + my connection status */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const server = await getServer(params.id);
    if (!server) return Response.json({ error: "Unknown server." }, { status: 404 });

    // Live tool list for remote servers (real data, best effort).
    let tools: { name: string; description: string }[] = [];
    let liveOk = false;
    if (server.transport === "remote" && server.server_url) {
      try {
        const client = new McpClient(server.server_url);
        const list = await client.listTools();
        tools = list.map((t) => ({ name: t.name, description: (t.description ?? "").slice(0, 300) }));
        liveOk = true;
      } catch {
        liveOk = false;
      }
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let mine: { status: string; created_at: string } | null = null;
    if (user) {
      const admin = createAdminSupabase();
      const { data } = await admin
        .from("mcp_connections")
        .select("status,created_at")
        .eq("user_id", user.id)
        .eq("server_id", server.id)
        .single();
      mine = data ?? null;
    }
    return Response.json({ server, tools, liveOk, myStatus: mine?.status ?? null });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed." },
      { status: 500 }
    );
  }
}

import { notFound, redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/admin";
import { getServer } from "@/lib/mcp/catalog";
import { McpClient } from "@/lib/mcp/client";
import { AppShell } from "@/components/AppShell";
import { ServerDetail } from "@/components/mcp/ServerDetail";

export const dynamic = "force-dynamic";

export default async function McpDetailPage({ params }: { params: { id: string } }) {
  // Admin-only: everyone else sees the Coming Soon teaser.
  if (!(await getAdmin())) redirect("/mcp/coming-soon");

  let server = null;
  try {
    server = await getServer(params.id);
  } catch {
    server = null;
  }
  if (!server) notFound();

  let tools: { name: string; description: string }[] = [];
  let liveOk = false;
  if (server.transport === "remote" && server.server_url) {
    try {
      const list = await new McpClient(server.server_url).listTools();
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
  let myStatus: string | null = null;
  if (user) {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("mcp_connections")
      .select("status")
      .eq("user_id", user.id)
      .eq("server_id", server.id)
      .single();
    myStatus = data?.status ?? null;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 pl-14 lg:pl-4">
        <a href="/mcp" className="text-[13px] text-zinc-500 hover:text-white">
          ← MCP Marketplace
        </a>
        <div className="mt-4">
          <ServerDetail
            server={server}
            tools={tools}
            liveOk={liveOk}
            myStatus={myStatus}
            isLoggedIn={!!user}
          />
        </div>
      </div>
    </AppShell>
  );
}

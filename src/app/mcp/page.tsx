import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/admin";
import { listServers } from "@/lib/mcp/catalog";
import { AppShell } from "@/components/AppShell";
import { Marketplace } from "@/components/mcp/Marketplace";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  // Admin-only: everyone else sees the Coming Soon teaser.
  if (!(await getAdmin())) redirect("/mcp/coming-soon");

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let servers: Awaited<ReturnType<typeof listServers>> = [];
  let dbMissing = false;
  try {
    servers = await listServers();
  } catch {
    dbMissing = true;
  }

  const admin = createAdminSupabase();
  const { data: conns } = await admin.from("mcp_connections").select("server_id").eq("status", "connected");
  const counts = new Map<string, number>();
  for (const c of conns ?? []) counts.set(c.server_id, (counts.get(c.server_id) ?? 0) + 1);

  let mine = new Map<string, string>();
  if (user) {
    const { data } = await admin
      .from("mcp_connections")
      .select("server_id,status")
      .eq("user_id", user.id);
    mine = new Map((data ?? []).map((c) => [c.server_id, c.status]));
  }

  const categories = [...new Set(servers.map((s) => s.category))].sort();

  if (dbMissing) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-2xl px-4 py-16 pl-14 text-center lg:pl-4">
          <h1 className="text-xl font-semibold text-white">Marketplace unavailable</h1>
          <p className="mt-2 text-sm text-zinc-400">
            The MCP catalog tables are missing. Run <code className="font-mono">supabase/mcp_schema.sql</code> and{" "}
            <code className="font-mono">supabase/mcp_seed.sql</code> in the Supabase SQL editor.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 pl-14 lg:pl-4">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">MCP Marketplace</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Connect Human AI to tools
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-7 text-zinc-400">
          MCP servers give Human AI real tools — docs search, prices, records, trading data
          and more. Every listing below was verified against a live endpoint. Connections
          belong to your account only.
        </p>
        <div className="mt-6">
          <Marketplace
            servers={servers.map((s) => ({
              ...s,
              connections: counts.get(s.id) ?? 0,
              myStatus: mine.get(s.id) ?? null,
            }))}
            categories={categories}
            featured={servers
              .filter((s) => s.featured)
              .map((s) => ({ ...s, connections: counts.get(s.id) ?? 0, myStatus: mine.get(s.id) ?? null }))}
            isLoggedIn={!!user}
          />
        </div>
      </div>
    </AppShell>
  );
}

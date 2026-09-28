import { createAdminSupabase } from "../supabase/server";
import { decryptSecret } from "./crypto";
import { McpClient, type McpTool } from "./client";

export type McpTransport = "remote" | "local";
export type McpAuthType = "none" | "api_key" | "oauth";
export type McpConnectionStatus = "connected" | "local" | "error";

export interface McpServer {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: string;
  repository: string | null;
  homepage: string | null;
  server_url: string | null;
  transport: McpTransport;
  auth_type: McpAuthType;
  installation_md: string;
  featured: boolean;
  verified_at: string | null;
  created_at: string;
}

export interface McpConnection {
  id: string;
  user_id: string;
  server_id: string;
  status: McpConnectionStatus;
  credentials_enc: string | null;
  server_url_override: string | null;
  tools_cache: McpTool[];
  tools_cached_at: string | null;
  last_used_at: string | null;
  created_at: string;
  server?: McpServer;
}

export interface ConnectedTool extends McpTool {
  serverId: string;
  serverName: string;
}

/** Public catalog (RLS allows public read; service client for consistency). */
export async function listServers(): Promise<McpServer[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("mcp_servers")
    .select("*")
    .order("featured", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`Catalog unavailable: ${error.message}`);
  return (data ?? []) as McpServer[];
}

export async function getServer(id: string): Promise<McpServer | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mcp_servers").select("*").eq("id", id).single();
  return (data as McpServer | null) ?? null;
}

function authHeaders(server: McpServer, connection: McpConnection | null): Record<string, string> {
  if (!connection?.credentials_enc) return {};
  try {
    const secret = decryptSecret(connection.credentials_enc);
    // api_key and user-supplied oauth tokens are sent as Bearer credentials.
    return { Authorization: `Bearer ${secret}` };
  } catch {
    return {};
  }
}

function effectiveUrl(server: McpServer, connection?: McpConnection | null): string | null {
  return connection?.server_url_override ?? server.server_url;
}

/**
 * User's connected remote servers with fresh-ish tool schemas.
 * Refreshes the cache when older than 1h (or missing).
 */
export async function connectedTools(
  userId: string
): Promise<{ servers: { id: string; name: string }[]; tools: ConnectedTool[] }> {
  const admin = createAdminSupabase();
  const { data: conns } = await admin
    .from("mcp_connections")
    .select("*, server:mcp_servers(*)")
    .eq("user_id", userId)
    .eq("status", "connected");

  const servers: { id: string; name: string }[] = [];
  const tools: ConnectedTool[] = [];
  for (const c of ((conns ?? []) as (McpConnection & { server: McpServer })[])) {
    const server = c.server;
    if (!server) continue;
    const url = effectiveUrl(server, c);
    if (!url || server.transport !== "remote") continue;
    servers.push({ id: server.id, name: server.name });

    let cached: McpTool[] = Array.isArray(c.tools_cache) ? c.tools_cache : [];
    const stale =
      !c.tools_cached_at || Date.now() - new Date(c.tools_cached_at).getTime() > 3600_000;
    if ((cached.length === 0 || stale) && url) {
      try {
        const client = new McpClient(url, { headers: authHeaders(server, c) });
        cached = await client.listTools();
        await admin
          .from("mcp_connections")
          .update({ tools_cache: cached, tools_cached_at: new Date().toISOString() })
          .eq("id", c.id);
      } catch {
        // keep stale cache rather than breaking chat
      }
    }
    for (const t of cached.slice(0, 24)) {
      tools.push({
        name: `${server.id}__${t.name}`.slice(0, 64),
        description: `[${server.name}] ${t.description ?? t.name}`.slice(0, 1024),
        inputSchema: t.inputSchema ?? { type: "object", properties: {} },
        serverId: server.id,
        serverName: server.name,
      });
    }
    if (tools.length >= 24) break;
  }
  return { servers, tools };
}

/** Execute one tool call on the user's connected server. */
export async function executeTool(
  userId: string,
  serverId: string,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
): Promise<{ serverName: string; result: string }> {
  const admin = createAdminSupabase();
  const { data: conn } = await admin
    .from("mcp_connections")
    .select("*, server:mcp_servers(*)")
    .eq("user_id", userId)
    .eq("server_id", serverId)
    .eq("status", "connected")
    .single();
  const c = conn as (McpConnection & { server: McpServer }) | null;
  if (!c?.server) throw new Error("MCP server is not connected.");
  const url = effectiveUrl(c.server, c);
  if (!url || c.server.transport !== "remote") {
    throw new Error("This MCP server has no reachable remote endpoint.");
  }
  const client = new McpClient(url, { headers: authHeaders(c.server, c) });
  const result = await client.callTool(toolName, args ?? {});
  await admin
    .from("mcp_connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", c.id);
  return { serverName: c.server.name, result };
}

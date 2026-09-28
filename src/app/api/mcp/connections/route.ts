import { NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getServer } from "@/lib/mcp/catalog";
import { probeEndpoint } from "@/lib/mcp/client";
import { encryptSecret, decryptSecret } from "@/lib/mcp/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerOf(connection: { credentials_enc: string | null }): Record<string, string> {
  if (!connection.credentials_enc) return {};
  try {
    return { Authorization: `Bearer ${decryptSecret(connection.credentials_enc)}` };
  } catch {
    return {};
  }
}

/** GET /api/mcp/connections — my connections with server info */
export async function GET() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mcp_connections")
    .select("id,server_id,status,server_url_override,tools_cached_at,last_used_at,created_at,server:mcp_servers(id,name,category)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return Response.json({ connections: data ?? [] });
}

/**
 * POST /api/mcp/connections — connect.
 * { server_id, api_key?, access_token?, custom_url? }
 * - none: direct connect (endpoint is probed first)
 * - api_key / oauth token: encrypted per-user storage, then probed with Bearer auth
 * - local servers: require custom_url (probed) → status stays usable via override
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = (await req.json()) as {
      server_id?: string;
      api_key?: string;
      access_token?: string;
      custom_url?: string;
    };
    if (!body.server_id) return Response.json({ error: "server_id required." }, { status: 400 });
    const server = await getServer(body.server_id);
    if (!server) return Response.json({ error: "Unknown server." }, { status: 404 });

    let credentialsEnc: string | null = null;
    const secret = (body.api_key ?? body.access_token ?? "").trim();
    if (secret) {
      if (secret.length < 4 || secret.length > 5000) {
        return Response.json({ error: "Invalid credential length." }, { status: 400 });
      }
      credentialsEnc = encryptSecret(secret);
    } else if (server.auth_type !== "none") {
      return Response.json(
        { error: "This server requires a credential (API key or access token)." },
        { status: 400 }
      );
    }

    let url = server.server_url;
    let override: string | null = null;
    if ((body.custom_url ?? "").trim()) {
      url = (body.custom_url ?? "").trim();
      override = url;
    }
    if (!url) {
      return Response.json(
        { error: "This server has no cloud endpoint. Provide a custom reachable URL or follow the setup guide." },
        { status: 400 }
      );
    }

    // Verify the endpoint really speaks MCP before saving.
    const headers = credentialsEnc ? bearerOf({ credentials_enc: credentialsEnc }) : {};
    let tools;
    try {
      tools = await probeEndpoint(url, headers);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Endpoint verification failed." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabase();
    const { error } = await admin.from("mcp_connections").upsert(
      {
        user_id: user.id,
        server_id: server.id,
        status: "connected",
        credentials_enc: credentialsEnc,
        server_url_override: override,
        tools_cache: tools.map((t) => ({
          name: t.name,
          description: t.description ?? "",
          inputSchema: t.inputSchema ?? {},
        })),
        tools_cached_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,server_id" }
    );
    if (error) throw error;
    return Response.json({ ok: true, tools: tools.map((t) => t.name) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Connect failed." }, { status: 500 });
  }
}

/** DELETE /api/mcp/connections?server_id= — disconnect (destroys stored credentials) */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const serverId = req.nextUrl.searchParams.get("server_id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("mcp_connections").delete().eq("user_id", user.id).eq("server_id", serverId);
  return Response.json({ ok: true });
}

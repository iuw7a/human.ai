import { NextRequest } from "next/server";
import { getAdmin, logAdminAction } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function mask(secret: string) {
  return secret.length <= 8 ? "••••" : `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/** GET /api/admin/api-keys — list (hashes never leave the server; prefix only) */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const admin = createAdminSupabase();
  const { data: keys } = await admin
    .from("api_keys")
    .select("id,user_id,name,prefix,enabled,usage_count,last_used_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const emails = new Map<string, string>();
  for (const k of (keys ?? []).slice(0, 100)) {
    if (!emails.has(k.user_id)) {
      const { data: u } = await admin.auth.admin.getUserById(k.user_id);
      emails.set(k.user_id, u?.user?.email ?? k.user_id.slice(0, 8));
    }
  }
  return Response.json({
    keys: (keys ?? []).map((k) => ({ ...k, owner: emails.get(k.user_id) ?? k.user_id.slice(0, 8) })),
  });
}

/** POST {user_id, name} — issue key; FULL SECRET RETURNED ONCE, then never again */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const { user_id, name } = (await req.json()) as { user_id?: string; name?: string };
    if (!user_id) return Response.json({ error: "user_id required." }, { status: 400 });
    const secret = `hai_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("api_keys")
      .insert({
        user_id,
        name: (name ?? "API key").slice(0, 80),
        key_hash: hex,
        prefix: secret.slice(0, 8),
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAdminAction(adminUser.id, "issued API key", String(data.id), { owner: user_id, prefix: mask(secret) });
    return Response.json({ ok: true, id: data.id, secret, warning: "Store this secret now — it will never be shown again." });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

/** PATCH {id, enabled} | DELETE ?id= — disable/revoke */
export async function PATCH(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const { id, enabled } = (await req.json()) as { id?: string; enabled?: boolean };
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  const admin = createAdminSupabase();
  await admin.from("api_keys").update({ enabled: !!enabled }).eq("id", id);
  await logAdminAction(adminUser.id, enabled ? "enabled API key" : "disabled API key", id);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("api_keys").delete().eq("id", id);
  await logAdminAction(adminUser.id, "revoked API key", id);
  return Response.json({ ok: true });
}

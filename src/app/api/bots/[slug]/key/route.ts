import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getOwnedBot, sessionUser, userIsPro } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "hbk_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** GET /api/bots/[slug]/key — list companion keys (prefix only, owner + Pro). */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_keys")
    .select("id,name,prefix,enabled,usage_count,last_used_at,created_at")
    .eq("user_id", user.id)
    .like("name", `Human Bot Desktop: ${bot.slug}%`)
    .order("created_at", { ascending: false });
  return Response.json({ keys: data ?? [] });
}

/** POST /api/bots/[slug]/key — mint a companion key (raw shown ONCE, owner + Pro). */
export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const raw = randomKey();
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: `Human Bot Desktop: ${bot.slug}`,
      key_hash: await sha256Hex(raw),
      prefix: raw.slice(0, 8),
      enabled: true,
    })
    .select("id,name,prefix,created_at")
    .single();
  if (error) return Response.json({ error: "Could not create key." }, { status: 500 });
  return Response.json({ key: data, raw });
}

/** DELETE /api/bots/[slug]/key?id= — revoke (owner + Pro). */
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await userIsPro(user.id))) {
    return Response.json({ error: "Human Bot requires a Pro subscription.", upgrade: true }, { status: 403 });
  }
  const bot = await getOwnedBot(params.slug, user.id);
  if (!bot) return Response.json({ error: "Bot not found." }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const admin = createAdminSupabase();
  await admin.from("api_keys").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ ok: true });
}

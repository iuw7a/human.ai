import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "hak_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** GET /api/keys — my API keys (prefix only, never raw). */
export async function GET() {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,name,prefix,enabled,usage_count,last_used_at,created_at")
    .eq("user_id", user.id)
    .like("name", "Human AI API:%")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return Response.json({ error: "Could not load keys." }, { status: 500 });
  return Response.json({ keys: data ?? [] });
}

/** POST /api/keys {label?} — mint a key (raw shown ONCE). Max 5 active. */
export async function POST(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const admin = createAdminSupabase();
  const { count } = await admin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .like("name", "Human AI API:%")
    .eq("enabled", true);
  if ((count ?? 0) >= 5) {
    return Response.json({ error: "Key limit reached (5). Revoke one first." }, { status: 400 });
  }
  const b = (await req.json().catch(() => null)) as { label?: unknown } | null;
  const label = (typeof b?.label === "string" ? b.label : "").trim().slice(0, 40) || "Default";
  const raw = randomKey();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: `Human AI API: ${label}`,
      key_hash: await sha256Hex(raw),
      prefix: raw.slice(0, 12),
      enabled: true,
    })
    .select("id,name,prefix,created_at")
    .single();
  if (error || !data) return Response.json({ error: "Could not create key." }, { status: 500 });
  return Response.json({ key: data, raw });
}

/** DELETE /api/keys?id= — revoke my key. */
export async function DELETE(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .like("name", "Human AI API:%");
  if (error) return Response.json({ error: "Could not revoke key." }, { status: 500 });
  return Response.json({ ok: true });
}

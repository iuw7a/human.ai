import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** POST /api/feedback {chat_id, model, rating, excerpt} — thumbs from chat UI */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { chat_id, model, rating, excerpt } = (await req.json()) as {
      chat_id?: string; model?: string; rating?: string; excerpt?: string;
    };
    if (rating !== "up" && rating !== "down") {
      return Response.json({ error: "rating must be up|down." }, { status: 400 });
    }
    await supabase.from("feedback").insert({
      user_id: user.id,
      chat_id: (chat_id ?? "").slice(0, 64),
      model: (model ?? "").slice(0, 64),
      rating,
      excerpt: (excerpt ?? "").slice(0, 500),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}

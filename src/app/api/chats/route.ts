import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/chats — delete ALL conversations of the signed-in user (chats, bot chats, uploads). */
export async function DELETE() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const admin = createAdminSupabase();
    // Remove stored upload files first (best effort), then all DB rows.
    try {
      const { data: attachments } = await admin
        .from("attachments")
        .select("storage_path")
        .eq("user_id", user.id);
      if (attachments && attachments.length > 0) {
        await admin.storage
          .from("attachments")
          .remove(attachments.map((a: { storage_path: string }) => a.storage_path).filter(Boolean));
      }
    } catch {
      // storage optional — never block the delete
    }
    await admin.from("attachments").delete().eq("user_id", user.id);
    await admin.from("messages").delete().eq("user_id", user.id);
    await admin.from("chats").delete().eq("user_id", user.id);
    await admin.from("bot_messages").delete().eq("user_id", user.id);
    await admin.from("bot_conversations").delete().eq("user_id", user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Deletion failed." },
      { status: 500 }
    );
  }
}

import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const admin = createAdminSupabase();
    // Remove user data (storage + tables) before deleting the auth user.
    const { data: attachments } = await admin
      .from("attachments")
      .select("storage_path")
      .eq("user_id", user.id);
    if (attachments && attachments.length > 0) {
      await admin.storage
        .from("attachments")
        .remove(attachments.map((a: { storage_path: string }) => a.storage_path));
    }
    await admin.from("attachments").delete().eq("user_id", user.id);
    await admin.from("messages").delete().eq("user_id", user.id);
    await admin.from("memories").delete().eq("user_id", user.id);
    await admin.from("chats").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Deletion failed." },
      { status: 500 }
    );
  }
}

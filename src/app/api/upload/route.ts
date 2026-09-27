import { NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = "attachments";

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const form = await req.formData();
    const chatId = String(form.get("chatId") ?? "general").slice(0, 64);
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return Response.json({ error: "No files provided." }, { status: 400 });
    }
    if (files.length > 4) {
      return Response.json({ error: "Max 4 images per message." }, { status: 400 });
    }

    const admin = createAdminSupabase();
    // Ensure bucket exists (idempotent).
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    const out: { path: string; url: string | null; mimeType: string }[] = [];
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        return Response.json(
          { error: `Unsupported type ${file.type}. Use PNG, JPEG, WebP or GIF.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return Response.json({ error: "Image too large — max 8 MB." }, { status: 400 });
      }
      const ext = file.type.split("/")[1] ?? "png";
      const path = `${user.id}/${chatId}/${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(`Upload failed: ${error.message}`);

      await admin.from("attachments").insert({
        user_id: user.id,
        chat_id: chatId,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });

      out.push({ path, url: null, mimeType: file.type });
    }
    return Response.json({ files: out });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 }
    );
  }
}

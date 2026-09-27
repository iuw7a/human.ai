import { NextRequest } from "next/server";
import { getAdmin, logAdminAction, logAppError } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = "public-assets";

/** POST /api/admin/upload (multipart: file) → {url} — public asset for ads/announcements */
export async function POST(req: NextRequest) {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided." }, { status: 400 });
    }
    if (!ACCEPTED.includes(file.type)) {
      return Response.json({ error: "Only PNG, JPEG, WebP or GIF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Max 8 MB." }, { status: 400 });
    }
    const admin = createAdminSupabase();
    await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const ext = file.type.split("/")[1] ?? "png";
    const path = `admin/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    await logAdminAction(adminUser.id, "uploaded public asset", path);
    return Response.json({ url: data.publicUrl, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    void logAppError("api/admin/upload", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

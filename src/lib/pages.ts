import { createAdminSupabase } from "@/lib/supabase/server";

export async function getPublishedPage(slug: string): Promise<{ title: string; content_md: string } | null> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("site_pages")
      .select("title,content_md")
      .eq("slug", slug)
      .eq("published", true)
      .single();
    return data ?? null;
  } catch {
    return null;
  }
}

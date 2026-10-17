import { createAdminSupabase } from "./supabase/server";

export interface Grant {
  id: string;
  user_id: string;
  model_slug: string;
  granted_by: string | null;
  created_at: string;
}

export async function listGrantsForUser(userId: string): Promise<string[]> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("user_model_grants").select("model_slug").eq("user_id", userId);
    return (data ?? []).map((r) => (r as { model_slug: string }).model_slug);
  } catch {
    return [];
  }
}

export async function listAllGrants(limit = 200): Promise<Grant[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("user_model_grants")
    .select("id,user_id,model_slug,granted_by,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Grant[]) ?? [];
}

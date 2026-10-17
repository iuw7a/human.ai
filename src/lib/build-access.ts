import { createAdminSupabase } from "@/lib/supabase/server";

export interface BuildAccessUser {
  id: string;
  email?: string | null;
}

export const BUILD_OWNER_EMAIL = (process.env.BUILD_OWNER_EMAIL || "ceo@usehuman.de").trim().toLowerCase();

export function isBuildOwner(user: BuildAccessUser): boolean {
  return user.email?.trim().toLowerCase() === BUILD_OWNER_EMAIL;
}

export async function hasBuildAccess(user: BuildAccessUser): Promise<boolean> {
  if (isBuildOwner(user)) return true;
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("build_access_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .gt("approved_until", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}

export async function requireBuildAccess(user: BuildAccessUser): Promise<Response | null> {
  if (await hasBuildAccess(user)) return null;
  return Response.json(
    {
      error: "Build is in development and isn't available on your account yet. Request access for an admin to review.",
      code: "BUILD_ACCESS_REQUIRED",
    },
    { status: 403 }
  );
}
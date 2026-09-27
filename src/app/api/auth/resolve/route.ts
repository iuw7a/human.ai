import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/auth/resolve {identifier} → {email}
 * Allows login with username (profile name) instead of email.
 * Returns the email for an exact (case-insensitive) name match.
 */
export async function POST(req: NextRequest) {
  try {
    const { identifier } = (await req.json()) as { identifier?: string };
    const id = (identifier ?? "").trim();
    if (!id) return Response.json({ error: "identifier required." }, { status: 400 });
    if (id.includes("@")) return Response.json({ email: id });
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("profiles")
      .select("email,name")
      .ilike("name", id)
      .limit(5);
    const exact = (data ?? []).find(
      (p) => (p.name ?? "").toLowerCase() === id.toLowerCase() && p.email
    );
    if (!exact?.email) {
      return Response.json({ error: "No account with that username." }, { status: 404 });
    }
    return Response.json({ email: exact.email });
  } catch {
    return Response.json({ error: "Resolve failed." }, { status: 500 });
  }
}

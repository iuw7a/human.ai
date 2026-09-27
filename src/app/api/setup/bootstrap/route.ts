import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEVS = [
  { email: "admin.a@human.ai", password: "Admin123", name: "Admin.a" },
  { email: "admin@human.ai", password: "admin123", name: "admin" },
];

/** POST /api/setup/bootstrap — create dev admin accounts. Works ONLY while no admin exists. */
export async function POST() {
  try {
    const admin = createAdminSupabase();
    const { data: existing, error: checkError } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (checkError) {
      return Response.json(
        { error: "Database tables missing. Run supabase/schema.sql and supabase/admin_schema.sql first." },
        { status: 500 }
      );
    }
    if ((existing ?? []).length > 0) {
      return Response.json({ error: "Already bootstrapped — an admin exists." }, { status: 403 });
    }

    const created: string[] = [];
    for (const d of DEVS) {
      const { data: u, error } = await admin.auth.admin.createUser({
        email: d.email,
        password: d.password,
        email_confirm: true,
        user_metadata: { name: d.name },
      });
      if (error) throw new Error(`${d.email}: ${error.message}`);
      await admin.from("profiles").upsert({
        id: u.user.id,
        name: d.name,
        email: d.email,
        role: "admin",
        plan: "plus",
        status: "active",
      });
      created.push(d.email);
    }
    await admin.from("audit_logs").insert({
      action: "bootstrap dev admins",
      target: created.join(","),
      metadata: {},
    });
    return Response.json({ ok: true, created });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Bootstrap failed." }, { status: 500 });
  }
}

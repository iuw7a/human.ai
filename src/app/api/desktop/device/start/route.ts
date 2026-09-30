import { createAdminSupabase } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(2));
  const a = String(1000 + (n[0] % 9000));
  const b = String(1000 + (n[1] % 9000));
  return `${a}-${b}`;
}

/** POST /api/desktop/device/start — mint a login code for the desktop app. Public. */
export async function POST() {
  const needSql = () =>
    Response.json(
      { error: "Database not set up: run supabase/desktop_device.sql once in the Supabase SQL editor, then retry." },
      { status: 500 }
    );
  try {
    const admin = createAdminSupabase();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { error } = await admin.from("desktop_device_codes").insert({ code });
      if (!error) return Response.json({ code, expires_in: 600 });
      if (isMissingTableError(error)) return needSql();
    }
    return Response.json({ error: "Could not start device login." }, { status: 500 });
  } catch (e) {
    if (isMissingTableError(e)) return needSql();
    return Response.json({ error: "Could not start device login." }, { status: 500 });
  }
}

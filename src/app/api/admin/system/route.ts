import { getAdmin } from "@/lib/admin";
import { createAdminSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/system — real health checks (no secrets exposed). */
export async function GET() {
  const adminUser = await getAdmin();
  if (!adminUser) return Response.json({ error: "Forbidden." }, { status: 403 });
  const checks: { name: string; status: "healthy" | "warning" | "error"; detail: string }[] = [];

  // Database
  try {
    const admin = createAdminSupabase();
    const t0 = Date.now();
    const { error } = await admin.from("profiles").select("id", { count: "exact", head: true });
    checks.push({
      name: "Database",
      status: error ? "error" : "healthy",
      detail: error ? error.message : `reachable in ${Date.now() - t0} ms`,
    });
  } catch (e) {
    checks.push({ name: "Database", status: "error", detail: e instanceof Error ? e.message : "unreachable" });
  }

  // Storage
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.storage.from("attachments").list("", { limit: 1 });
    checks.push({
      name: "Storage",
      status: error ? "warning" : "healthy",
      detail: error ? `bucket issue: ${error.message}` : `bucket ok (${data?.length ?? 0} entries listed)`,
    });
  } catch (e) {
    checks.push({ name: "Storage", status: "error", detail: e instanceof Error ? e.message : "unreachable" });
  }

  // AI provider (models list — proves key + connectivity, reveals nothing secret)
  try {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
      checks.push({ name: "AI provider", status: "error", detail: "NVIDIA_API_KEY not configured" });
    } else {
      const t0 = Date.now();
      const res = await fetch(`${process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1"}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      checks.push({
        name: "AI provider",
        status: res.ok ? "healthy" : "error",
        detail: res.ok ? `reachable in ${Date.now() - t0} ms` : `HTTP ${res.status}`,
      });
    }
  } catch (e) {
    checks.push({ name: "AI provider", status: "error", detail: e instanceof Error ? e.message : "unreachable" });
  }

  // Errors in last 24h
  try {
    const admin = createAdminSupabase();
    const { count } = await admin
      .from("app_errors")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString());
    checks.push({
      name: "Errors (24h)",
      status: (count ?? 0) > 0 ? "warning" : "healthy",
      detail: `${count ?? 0} logged errors`,
    });
  } catch {
    checks.push({ name: "Errors (24h)", status: "warning", detail: "could not query" });
  }

  checks.push({
    name: "Application",
    status: "healthy",
    detail: `Human AI v1.0.0 · Next.js · runtime nodejs`,
  });

  return Response.json({ checks });
}

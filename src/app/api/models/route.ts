import { createServerSupabase } from "@/lib/supabase/server";
import { listDbModels, getAdmin } from "@/lib/admin";
import { getEffectiveSubscription, canAccessModel } from "@/lib/subscriptions";
import { getChatDefaults } from "@/lib/chat-defaults";
import { listGrantsForUser } from "@/lib/model-grants";
import { isGatewayProvider } from "@/lib/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/models — user-facing picker.
 * Shows ONLY CodeCraft gateway models + free built-ins.
 * Kira/Nara and other payment-needing models stay admin-only
 * (visible in /admin → API Lab, usable via grants/admin).
 * White-label: no provider internals. Server remains source of truth.
 */
export async function GET() {
  const supabase = createServerSupabase();
  const [models, defaults, userRes] = await Promise.all([
    listDbModels(),
    getChatDefaults(),
    supabase.auth.getUser().catch(() => ({ data: { user: null } as { user: null } })),
  ]);
  const user = (userRes as { data: { user: { id: string } | null } }).data?.user ?? null;

  let allowedSet: Set<string> | null = null;
  let grantedSet = new Set<string>();
  let isAdmin = false;
  if (user) {
    const [sub, grants, admin] = await Promise.all([
      getEffectiveSubscription(user.id),
      listGrantsForUser(user.id).catch(() => [] as string[]),
      getAdmin().catch(() => null),
    ]);
    isAdmin = admin !== null;
    allowedSet = new Set(
      models.filter((m) => m.enabled && canAccessModel(sub, m)).map((m) => m.id)
    );
    grantedSet = new Set(grants);
    for (const g of grantedSet) allowedSet.add(g);
    // Admins may use every enabled model (mirrors /api/chat bypass).
    if (isAdmin) {
      for (const m of models) if (m.enabled) allowedSet.add(m.id);
    }
  }
  // Visibility: admins see everything. Regular users see free built-ins,
  // CodeCraft (Plus-gated below via `allowed`), and models explicitly
  // granted to them — other gateways (kira/bynara/...) stay admin-only.
  const visible = models.filter((m) => {
    if (!m.enabled) return false;
    if (isAdmin) return true;
    if (grantedSet.has(m.id)) return true;
    if (isGatewayProvider(m.provider as string) && m.provider !== "codecraft") return false;
    return m.provider === "codecraft" || m.plan === "free";
  });
  return Response.json({
    defaults,
    models: visible
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((m) => ({
        id: m.id,
        name: m.name,
        vision: m.vision,
        plan: m.plan,
        access_level: m.access_level,
        allowed: allowedSet ? allowedSet.has(m.id) : undefined,
        via_admin: grantedSet.has(m.id),
        is_default: m.is_default,
        is_chat_default: defaults.chat === m.id,
        is_image_default: defaults.image === m.id,
        is_code_default: defaults.code === m.id,
      })),
  });
}

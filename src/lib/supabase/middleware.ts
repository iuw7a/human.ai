import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const PUBLIC_PREFIXES = [
  "/maintenance",
  "/banned",
  "/login",
  "/logout",
  "/terms",
  "/platform/about",
  // Stripe calls this directly (signature-verified). It must survive
  // maintenance mode and must not depend on a logged-in session.
  "/api/stripe/webhook",
];

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

// ---- Speed: tiny in-memory caches (per server instance) ----
// The middleware runs on EVERY request (pages, APIs, static-adjacent).
// Without caching it costs up to 3 sequential Supabase round-trips
// (getUser + profiles + app_settings ≈ 150-300 ms). These caches cut
// the steady-state cost to ~1 round-trip (getUser only).
const MAINT_TTL_MS = 30_000;
const PROFILE_TTL_MS = 60_000;
let maintCache: { at: number; on: boolean } | null = null;
const profileCache = new Map<string, { at: number; role: string | null; status: string }>();
let adminClient: ReturnType<typeof createClient> | null = null;

function getAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );
  }
  return adminClient;
}

async function isMaintenanceOn(): Promise<boolean> {
  const now = Date.now();
  if (maintCache && now - maintCache.at < MAINT_TTL_MS) return maintCache.on;
  try {
    const { data: settings } = (await getAdmin()
      .from("app_settings")
      .select("key,value")
      .in("key", ["maintenance"])) as { data: { key: string; value: string }[] | null };
    const on = (settings ?? []).find((s) => s.key === "maintenance")?.value === "on";
    maintCache = { at: now, on };
    return on;
  } catch {
    return false;
  }
}

async function getProfileRole(userId: string): Promise<{ role: string | null; status: string }> {
  const now = Date.now();
  const hit = profileCache.get(userId);
  if (hit && now - hit.at < PROFILE_TTL_MS) return hit;
  try {
    const { data: profile } = (await getAdmin()
      .from("profiles")
      .select("role,status")
      .eq("id", userId)
      .single()) as { data: { role: string | null; status: string } | null };
    const res = { role: (profile?.role as string | null) ?? null, status: profile?.status ?? "active" };
    // Never cache a banned/suspended status — enforcement must apply instantly.
    if (res.status === "active") {
      if (profileCache.size > 5000) profileCache.clear();
      profileCache.set(userId, { at: now, ...res });
    }
    return res;
  } catch {
    return { role: null, status: "active" };
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return response;
  }

  // Speed: anonymous users only need the (cached) maintenance flag — no profile lookup.
  if (!user) {
    try {
      if (!path.startsWith("/admin")) {
        const on = await isMaintenanceOn();
        if (on && !path.startsWith("/api/")) {
          return NextResponse.rewrite(new URL("/maintenance", request.url));
        }
        if (on && path.startsWith("/api/")) {
          return NextResponse.json({ error: "Maintenance mode is active." }, { status: 503 });
        }
      }
    } catch {
      // enforcement must never break the app if the DB is unreachable
    }
    return response;
  }

  // Server-side account + maintenance enforcement (service-role, never client).
  // Speed: profile + maintenance flag load in parallel; both are cached.
  try {
    const [{ role, status }, maintOn] = await Promise.all([
      getProfileRole(user.id),
      isMaintenanceOn(),
    ]);

    if (status !== "active") {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/banned", request.url));
    }

    if (!isAdminRole(role)) {
      if (maintOn && !path.startsWith("/admin")) {
        if (path.startsWith("/api/")) {
          return NextResponse.json({ error: "Maintenance mode is active." }, { status: 503 });
        }
        return NextResponse.rewrite(new URL("/maintenance", request.url));
      }
    }
  } catch {
    // enforcement must never break the app if the DB is unreachable
  }

  return response;
}

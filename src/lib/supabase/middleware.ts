import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const PUBLIC_PREFIXES = ["/maintenance", "/banned", "/login", "/logout", "/terms", "/platform/about"];

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
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

  // Server-side account + maintenance enforcement (service-role, never client).
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );
    let role: string | null = null;
    let status = "active";
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role,status")
        .eq("id", user.id)
        .single();
      role = profile?.role ?? null;
      status = profile?.status ?? "active";
    }

    if (user && status !== "active") {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/banned", request.url));
    }

    if (!isAdminRole(role)) {
      const { data: settings } = await admin
        .from("app_settings")
        .select("key,value")
        .in("key", ["maintenance"]);
      const on = (settings ?? []).find((s) => s.key === "maintenance")?.value === "on";
      if (on && !path.startsWith("/admin")) {
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

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const RESERVED_SUBS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "preview",
  "mail",
  "blog",
  "docs",
  "status",
  "support",
  "desktop",
  "platform",
]);

export async function middleware(request: NextRequest) {
  const decoded = decodeURIComponent(request.nextUrl.pathname);
  if (
    decoded === "/admin/team rema humi" ||
    request.nextUrl.pathname === "/admin/team rema humi" ||
    request.nextUrl.pathname === "/admin/team%20rema%20humi" ||
    request.nextUrl.pathname === "/admin/team"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/team-rema-humi";
    return NextResponse.redirect(url);
  }
  // Published user sites: <sub>.usehuman.de (or <sub>.localhost in dev)
  // -> /published/[sub]/[...path]. Needs wildcard DNS *.usehuman.de.
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  // Documentation subdomain: docs.localhost:3000 / docs.usehuman.de -> /docs
  if (host === "docs.localhost" || host === "docs.usehuman.de") {
    const url = request.nextUrl.clone();
    const rest = request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname;
    url.pathname = `/docs${rest}`;
    return NextResponse.rewrite(url);
  }
  const m = host.match(/^([a-z0-9-]{3,40})\.(usehuman\.de|localhost)$/);
  if (m && !RESERVED_SUBS.has(m[1])) {
    const url = request.nextUrl.clone();
    url.pathname = `/published/${m[1]}${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.webp|land.bg.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"],
};

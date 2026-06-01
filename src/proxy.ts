import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/kiosk",
  "/manifest.webmanifest",
  "/icon.svg",
  "/nanoldapan-logo.png",
  "/favicon.ico",
  "/sw.js",
]);

function isKioskAllowedPath(pathname: string) {
  return (
    PUBLIC_EXACT_PATHS.has(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
  );
}

export function proxy(request: NextRequest) {
  if (isKioskAllowedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const kioskUrl = request.nextUrl.clone();
  kioskUrl.pathname = "/kiosk";
  kioskUrl.search = "";
  return NextResponse.redirect(kioskUrl);
}

export const config = {
  matcher: ["/:path*"],
};

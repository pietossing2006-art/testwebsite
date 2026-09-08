import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/adminplus/config";

/**
 * Gates /dashboard behind a real splitwise session (set by loginAction after
 * a successful call to server/routes/auth.js's /api/auth/login). Signed-in
 * staff are bounced away from the auth pages back into the dashboard.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && pathname.startsWith("/dashboard")) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/v1/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname.startsWith("/auth")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard/default";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*"],
};

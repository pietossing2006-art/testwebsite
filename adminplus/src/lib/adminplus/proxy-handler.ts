import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, SPLITWISE_API_BASE } from "./config";

/**
 * Builds a catch-all route handler that forwards `/api/<prefix>/...` to the
 * splitwise server with the viewer's own session token as a Bearer header.
 * The server still owns every permission check (requireAdmin/requireOwner/…),
 * so this proxy can never grant more access than the caller already has — it
 * just keeps the token out of the browser and avoids CORS.
 */
export function createProxyHandler(prefix: string) {
  return async function handle(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
    const { path } = await context.params;
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const targetUrl = `${SPLITWISE_API_BASE}/api/${prefix}/${path.join("/")}${req.nextUrl.search}`;

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(req.method)) {
      const bodyText = await req.text();
      if (bodyText) {
        body = bodyText;
        headers["Content-Type"] = req.headers.get("content-type") || "application/json";
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl, { method: req.method, headers, body, cache: "no-store" });
    } catch {
      return NextResponse.json(
        { error: "splitwise_unreachable", message: `เชื่อมต่อ splitwise server ไม่ได้ (${SPLITWISE_API_BASE})` },
        { status: 502 },
      );
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  };
}

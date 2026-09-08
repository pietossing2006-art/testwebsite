import { type NextRequest, NextResponse } from "next/server";

import { SPLITWISE_API_BASE } from "@/lib/adminplus/config";

/**
 * Serves the splitwise server's /uploads/* files through Admin+'s own origin.
 *
 * Image URLs are stored as relative paths ("/uploads/products/x.jpg"). AdminV3 rewrote
 * those to the API host at render time (resolveImageUrl); here we proxy instead, so
 * <img src="/uploads/..."> just works — on localhost and behind the Cloudflare Tunnel
 * alike — without publishing the API host to the browser.
 *
 * These files are already public on the API server (express.static), so no auth is
 * required; this route adds no exposure beyond what the storefront already serves.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;

  // Never let a segment climb out of /uploads.
  if (path.some((segment) => segment === ".." || segment === "." || segment.includes("\\"))) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const target = `${SPLITWISE_API_BASE}/uploads/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "splitwise_unreachable" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "not_found" }, { status: upstream.status === 404 ? 404 : 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=604800",
    },
  });
}

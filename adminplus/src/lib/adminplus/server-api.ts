import { cookies } from "next/headers";

import { SESSION_COOKIE, SPLITWISE_API_BASE } from "./config";

export class ServerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Server-side GET against the splitwise API using the viewer's session token. */
export async function serverAdminGet<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) throw new ServerApiError("unauthorized", 401);

  let res: Response;
  try {
    res = await fetch(`${SPLITWISE_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new ServerApiError("splitwise_unreachable", 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : `request_failed_${res.status}`;
    throw new ServerApiError(code, res.status);
  }
  return data as T;
}

/** Runs several GETs, returning null for the ones that fail (optional panels). */
export async function serverAdminGetAllSettled<T extends readonly string[]>(
  paths: T,
): Promise<{ [K in keyof T]: unknown | null }> {
  const results = await Promise.allSettled(paths.map((p) => serverAdminGet<unknown>(p)));
  return results.map((r) => (r.status === "fulfilled" ? r.value : null)) as { [K in keyof T]: unknown | null };
}

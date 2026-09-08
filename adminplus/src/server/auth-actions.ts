"use server";

import { cookies, headers } from "next/headers";

import { SESSION_COOKIE, SESSION_USER_COOKIE, SPLITWISE_API_BASE, STAFF_ROLES, type AdminplusUser } from "@/lib/adminplus/config";

/**
 * True when the browser reached us over HTTPS. Behind the Cloudflare Tunnel the Next server
 * itself listens on plain HTTP, so NODE_ENV can't decide this — the forwarded proto can.
 */
async function isSecureRequest(): Promise<boolean> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";
  return process.env.NODE_ENV === "production";
}

export type LoginInput = {
  identifier: string;
  password: string;
  remember?: boolean;
};

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function loginAction(input: LoginInput): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${SPLITWISE_API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // server/lib/requestSchemas.js's LoginBodySchema accepts `login` or
        // `email`, not `identifier` — it derives `identifier` itself.
        login: input.identifier,
        password: input.password,
        remember: Boolean(input.remember),
      }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      error: `เชื่อมต่อ splitwise server ไม่ได้ (${SPLITWISE_API_BASE}) ตรวจสอบว่า server รันอยู่หรือไม่`,
    };
  }

  const data = await res.json().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    const errorCode = typeof data.error === "string" ? data.error : "";
    if (errorCode === "invalid_credentials") return { ok: false, error: "อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง" };
    if (errorCode === "banned") return { ok: false, error: "บัญชีนี้ถูกระงับการใช้งาน" };
    if (typeof data.message === "string" && data.message) return { ok: false, error: data.message };
    return { ok: false, error: "เข้าสู่ระบบไม่สำเร็จ" };
  }

  if (data.two_factor_required) {
    return { ok: false, error: "บัญชีนี้เปิดใช้งาน 2FA ซึ่ง Adminplus ยังไม่รองรับในตอนนี้ กรุณาปิด 2FA ชั่วคราวหรือเข้าสู่ระบบผ่านเว็บหลักก่อน" };
  }

  const user = data.user as
    | { id: number; email: string; username: string | null; display_name: string | null; avatar_url: string | null; role: string }
    | undefined;
  const token = typeof data.token === "string" ? data.token : "";

  if (!user || !token) {
    return { ok: false, error: "การตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง" };
  }

  const role = String(user.role || "user").trim().toLowerCase();
  if (!STAFF_ROLES.has(role)) {
    return { ok: false, error: "บัญชีนี้ไม่มีสิทธิ์เข้าถึง Adminplus (ต้องเป็น staff ขึ้นไป)" };
  }

  const maxAge = input.remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const cookieStore = await cookies();
  const secure = await isSecureRequest();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });

  const publicUser: AdminplusUser = {
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    display_name: user.display_name ?? null,
    avatar_url: user.avatar_url ?? null,
    role,
  };
  cookieStore.set(SESSION_USER_COOKIE, JSON.stringify(publicUser), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });

  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(SESSION_USER_COOKIE);

  if (token) {
    try {
      await fetch(`${SPLITWISE_API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      // Best-effort server-side session revoke; the local cookie is already cleared.
    }
  }
}

export async function getCurrentAdminUser(): Promise<AdminplusUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminplusUser;
  } catch {
    return null;
  }
}

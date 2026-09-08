// Client-side fetch helper for the /api/admin/* proxy (see
// src/app/api/admin/[...path]/route.ts). Mirrors the shape of the old
// client/src/pages/AdminV3's `fetchJson`, so error handling/messages line up.

export class AdminApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init?: RequestInit, prefix = "/api/admin"): Promise<T> {
  const res = await fetch(`${prefix}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const errorCode = typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : `request_failed_${res.status}`;
    throw new AdminApiError(errorCode, res.status, data);
  }
  return data as T;
}

function createApi(prefix: string) {
  return {
    get: <T>(path: string) => request<T>(path, { method: "GET" }, prefix),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }, prefix),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }, prefix),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }, prefix),
    // A couple of splitwise endpoints (e.g. product-option-stock-bindings) read
    // their target from a DELETE body rather than the path.
    delete: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined }, prefix),
    /** For endpoints that answer with a file (CSV/TXT) instead of JSON. */
    getText: async (path: string) => {
      const res = await fetch(`${prefix}${path}`, { method: "GET" });
      const text = await res.text();
      if (!res.ok) {
        let data: unknown = {};
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        const errorCode = typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : `request_failed_${res.status}`;
        throw new AdminApiError(errorCode, res.status, data);
      }
      return text;
    },
  };
}

/** Calls /api/admin/* on the splitwise server through the local proxy. */
export const adminApi = createApi("/api/admin");
/** Calls /api/staff/* (clock in/out, staff notifications) through the local proxy. */
export const staffApi = createApi("/api/staff");

const ERROR_MESSAGES_TH: Record<string, string> = {
  points_over_hard_limit: "จำนวนแต้มเกินขีดจำกัดสูงสุดที่ระบบอนุญาต (สูงสุดครั้งละ 100,000,000 แต้ม)",
  owner_approval_required_for_large_adjustment: "การปรับแต้ม 50,000 ขึ้นไปต้องดำเนินการโดย Owner เท่านั้น",
  invalid_points: "จำนวนแต้มไม่ถูกต้อง กรุณากรอกตัวเลขที่มากกว่า 0",
  user_not_found: "ไม่พบบัญชีผู้ใช้นี้ในระบบ",
  not_found: "ไม่พบข้อมูลนี้ในระบบ",
  cannot_ban_owner: "ไม่สามารถระงับ/แบนบัญชีระดับ Owner ได้",
  cannot_delete_self: "ไม่สามารถลบบัญชีของตัวเองได้",
  cannot_modify_owner: "ไม่มีสิทธิ์แก้ไขข้อมูลบัญชีระดับ Owner",
  cannot_remove_last_owner: "ต้องมีบัญชี Owner เหลืออย่างน้อย 1 คนเสมอ",
  invalid_role: "สิทธิ์การใช้งานไม่ถูกต้อง",
  invalid_id: "รหัสอ้างอิงไม่ถูกต้อง",
  invalid_username: "Username ต้องมีอย่างน้อย 6 ตัวอักษร",
  invalid_username_charset: "Username ใช้ได้เฉพาะ a-z A-Z 0-9 . - _",
  username_taken: "Username นี้ถูกใช้งานแล้ว",
  invalid_email: "รูปแบบอีเมลไม่ถูกต้อง",
  email_taken: "อีเมลนี้ถูกใช้งานแล้ว",
  unauthorized: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
  forbidden: "คุณไม่มีสิทธิ์ในการดำเนินการนี้",
  splitwise_unreachable: "เชื่อมต่อ splitwise server ไม่ได้",
};

export function getErrorMessage(err: unknown, fallback = "เกิดข้อผิดพลาดในการดำเนินการ"): string {
  if (err instanceof AdminApiError) {
    const data = err.data as { message?: unknown; error?: unknown } | undefined;
    const apiMessage = String(data?.message || "").trim();
    if (apiMessage) return apiMessage;
    const apiError = String(data?.error || err.message || "").trim();
    if (apiError && ERROR_MESSAGES_TH[apiError]) return ERROR_MESSAGES_TH[apiError];
    if (err.status === 401) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
    if (err.status === 403) return "คุณไม่มีสิทธิ์ในการดำเนินการนี้ (Forbidden)";
    if (apiError) return apiError;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

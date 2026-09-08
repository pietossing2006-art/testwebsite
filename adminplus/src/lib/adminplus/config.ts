// Base URL of the splitwise server/ API that Adminplus talks to.
export const SPLITWISE_API_BASE = (process.env.SPLITWISE_API_BASE ?? "http://localhost:3001").replace(/\/+$/, "");

export const SESSION_COOKIE = "adminplus_session";
export const SESSION_USER_COOKIE = "adminplus_session_user";

// Roles allowed into Adminplus. Matches server/lib/auth.js's requireStaff set.
export const STAFF_ROLES = new Set(["owner", "admin", "finance", "booster", "support"]);

export type AdminplusUser = {
  id: number;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
};

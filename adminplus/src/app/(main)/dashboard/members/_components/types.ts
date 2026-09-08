export type ManagementUser = {
  id: number;
  email: string;
  username: string | null;
  role: string;
  is_banned: boolean;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  balance: number;
  orders_count: number;
  total_spend_points: number;
};

export type TransactionRow = {
  id: number;
  type: "credit" | "debit";
  points: number;
  ref_type: string | null;
  ref_id: number | null;
  created_at: string;
};

export type TopupRow = {
  id: number;
  amount: number;
  amount_points: number;
  method: string | null;
  provider: string | null;
  status: string;
  created_at: string;
};

export type SessionRow = {
  token: string;
  created_at: string;
  expires_at: string | null;
};

export type AuditRow = {
  id: number;
  actor_username: string | null;
  actor_email: string | null;
  action: string;
  created_at: string;
};

export type UserOrderRow = {
  order_item_id: number;
  order_id: number;
  ref: string | null;
  product_name: string;
  product_image_url: string | null;
  product_option: string | null;
  created_at: string;
};

export type ManagementDetail = {
  user: ManagementUser;
  topups: TopupRow[];
  transactions: TransactionRow[];
  sessions: SessionRow[];
  audits: AuditRow[];
  security: {
    is_banned: boolean;
    role: string;
    active_sessions: number;
    total_sessions: number;
    last_session_at: string | null;
  };
  snapshot: {
    topups_total: number;
    topups_pending: number;
    topups_approved: number;
    topups_rejected: number;
    transactions_total: number;
    transactions_credit_points: number;
    transactions_debit_points: number;
  };
};

export const USER_ROLE_OPTIONS = ["owner", "admin", "finance", "support", "booster", "user"] as const;

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  support: "Support",
  booster: "Booster",
  user: "User",
};

export function canEditUsers(role: string) {
  return role === "admin" || role === "owner";
}

export function canAdjustPoints(role: string) {
  return role === "finance" || role === "admin" || role === "owner";
}

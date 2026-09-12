// Shapes returned by the admin-dashboard edge function and consumed by the admin UI.

export interface AdminCostPoint {
  /** ISO timestamp of the bucket start (day or month). */
  bucket: string;
  /** Summed AI cost in USD for the bucket. */
  cost: number;
}

export interface AdminMetrics {
  total_usd: number;
  today_usd: number;
  month_usd: number;
  daily: AdminCostPoint[];
  monthly: AdminCostPoint[];
}

export type AdminAccessKind = "subscriber" | "trial" | "exempt" | "legacy";

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  /** Extras bucket (never expires). */
  credit_balance: number;
  /** Plan / trial bucket, valid until plan_period_end. */
  plan_credits: number;
  plan_period_end: string | null;
  access_kind: AdminAccessKind | string;
  trial_started_at: string | null;
  /** Masked server-side (LGPD): only the last two digits. */
  cpf_masked: string | null;
  total_usd: number;
  last_sign_in_at: string | null;
  created_at: string | null;
  is_active: boolean;
  is_super_admin: boolean;
}

export interface AdminDashboardData {
  metrics: AdminMetrics;
  users: AdminUser[];
}

export type AdminUserAction = "ban" | "unban";

export interface SetUserStatusInput {
  userId: string;
  action: AdminUserAction;
}

export interface GrantCreditsInput {
  userId: string;
  amount: number;
}

/** Change a user's access kind (never 'subscriber') or extend a running trial. */
export type SetAccessInput =
  | { userId: string; kind: "trial" | "exempt" | "legacy" }
  | { userId: string; extendDays: 7 | 14 | 30 };

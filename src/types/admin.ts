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

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  credit_balance: number;
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

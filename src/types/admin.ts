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

/** The most recent approved charge on a subscription. */
export interface AdminLastCharge {
  amount_brl: number;
  debit_date: string | null;
  refunded_at: string | null;
}

/** The user's live subscription, or the most recent attempt. */
export interface AdminSubscription {
  status: string;
  plan_name: string | null;
  price_brl: number;
  next_payment_date: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  /** Set only for a trial that started with a card (round 2). */
  trial_ends_at: string | null;
  first_payment_confirmed: boolean;
  /** Absent on an old backend that has not shipped it yet. */
  last_charge?: AdminLastCharge | null;
}

export interface AdminSubscriptionSummary {
  by_status: Record<string, number>;
  /** Estimated MRR: sum of the plan prices of authorized subscriptions. */
  mrr_brl: number;
  live: number;
}

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
  subscription?: AdminSubscription | null;
  /** Number of invoices with refunded_at across the user's subscriptions. Absent on an old backend. */
  refund_count?: number;
}

export interface AdminDashboardData {
  metrics: AdminMetrics;
  users: AdminUser[];
  subscriptions?: AdminSubscriptionSummary;
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

/** Invite a new account: Trial (7 days, 50 credits on acceptance) or Cortesia (exempt). */
export interface CreateUserInput {
  email: string;
  fullName: string;
  mode: "trial" | "exempt";
}

export interface ChangeEmailInput {
  userId: string;
  email: string;
}

/** Change a user's access kind (never 'subscriber') or extend a running trial. */
export type SetAccessInput =
  | { userId: string; kind: "trial" | "exempt" | "legacy" }
  | { userId: string; extendDays: 7 | 14 | 30 };

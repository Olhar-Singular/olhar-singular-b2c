// Pure data-shaping helpers for the admin-dashboard edge function.
// Kept free of I/O so they are fully unit-testable.

export interface AuthUserLite {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  created_at?: string | null;
}

export interface ProfileLite {
  id: string;
  full_name?: string | null;
  credit_balance?: number | null;
  is_super_admin?: boolean | null;
  access_kind?: string | null;
  plan_credits?: number | null;
  plan_period_end?: string | null;
  trial_started_at?: string | null;
  cpf?: string | null;
}

export interface SpendingLite {
  user_id: string;
  total_usd?: number | string | null;
}

export interface SeriesRow {
  bucket: string;
  cost: number | string | null;
}

/** A subscriptions row joined with its plan, as the dashboard reads it. */
export interface SubscriptionLite {
  id?: string;
  user_id: string;
  status: string;
  next_payment_date?: string | null;
  current_period_end?: string | null;
  mp_preapproval_id?: string | null;
  created_at?: string | null;
  trial_ends_at?: string | null;
  first_payment_confirmed?: boolean | null;
  plans?: { name?: string | null; price_brl?: number | string | null } | null;
}

/** The most recent approved charge on a subscription. */
export interface LastCharge {
  amount_brl: number;
  debit_date: string | null;
  refunded_at: string | null;
}

/** A subscription_invoices row, as the dashboard reads it (approved charges only). */
export interface InvoiceLite {
  subscription_id: string;
  amount_brl: number | string | null;
  debit_date: string | null;
  refunded_at: string | null;
}

export interface AdminSubscriptionRow {
  status: string;
  plan_name: string | null;
  price_brl: number;
  next_payment_date: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  trial_ends_at: string | null;
  first_payment_confirmed: boolean;
  last_charge: LastCharge | null;
}

export interface AdminSubscriptionSummary {
  by_status: Record<string, number>;
  /** Sum of the plan prices of authorized subscriptions (estimated MRR). */
  mrr_brl: number;
  live: number;
}

const LIVE_STATUSES = ["authorized", "past_due", "paused"];
const STATUS_RANK: Record<string, number> = { authorized: 0, past_due: 1, paused: 2, pending: 3, cancelled: 4, rejected: 5 };

export interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  /** Extras bucket (never expires). */
  credit_balance: number;
  /** Plan / trial bucket, valid until plan_period_end. */
  plan_credits: number;
  plan_period_end: string | null;
  access_kind: string;
  trial_started_at: string | null;
  /** LGPD: the admin sees only the last two digits. */
  cpf_masked: string | null;
  total_usd: number;
  last_sign_in_at: string | null;
  created_at: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  /** The live subscription, or the most recent one; null when never subscribed. */
  subscription: AdminSubscriptionRow | null;
}

// One row per user: the live one wins; otherwise the newest attempt.
// `lastChargeBySubscription` (keyed by subscription id) attaches the most
// recent approved charge to the winning row, when known.
export function pickSubscriptionPerUser(
  rows: SubscriptionLite[],
  lastChargeBySubscription: Map<string, LastCharge> = new Map(),
): Map<string, AdminSubscriptionRow> {
  const byUser = new Map<string, SubscriptionLite>();
  for (const row of rows) {
    const current = byUser.get(row.user_id);
    if (!current) {
      byUser.set(row.user_id, row);
      continue;
    }
    const rank = (STATUS_RANK[row.status] ?? 9) - (STATUS_RANK[current.status] ?? 9);
    const newer = Date.parse(row.created_at ?? "") > Date.parse(current.created_at ?? "");
    if (rank < 0 || (rank === 0 && newer)) byUser.set(row.user_id, row);
  }
  const out = new Map<string, AdminSubscriptionRow>();
  for (const [userId, row] of byUser) {
    out.set(userId, {
      status: row.status,
      plan_name: row.plans?.name ?? null,
      price_brl: Number(row.plans?.price_brl ?? 0),
      next_payment_date: row.next_payment_date ?? null,
      current_period_end: row.current_period_end ?? null,
      mp_preapproval_id: row.mp_preapproval_id ?? null,
      trial_ends_at: row.trial_ends_at ?? null,
      first_payment_confirmed: row.first_payment_confirmed ?? false,
      last_charge: (row.id ? lastChargeBySubscription.get(row.id) : undefined) ?? null,
    });
  }
  return out;
}

// One entry per subscription: the invoice with the latest debit_date wins.
// Callers pre-filter to approved invoices with a mp_payment_id.
export function pickLastChargePerSubscription(invoices: InvoiceLite[]): Map<string, LastCharge> {
  const bySubscription = new Map<string, InvoiceLite>();
  for (const invoice of invoices) {
    const current = bySubscription.get(invoice.subscription_id);
    const currentIsUndated = !current || Number.isNaN(Date.parse(current.debit_date ?? ""));
    // currentIsUndated is false only when current.debit_date parsed to a real date, so the
    // right-hand side never sees a null/empty debit_date here: no "?? ''" fallback to reach.
    if (currentIsUndated || Date.parse(invoice.debit_date ?? "") > Date.parse(current!.debit_date!)) {
      bySubscription.set(invoice.subscription_id, invoice);
    }
  }
  const out = new Map<string, LastCharge>();
  for (const [subscriptionId, invoice] of bySubscription) {
    out.set(subscriptionId, {
      amount_brl: Number(invoice.amount_brl ?? 0),
      debit_date: invoice.debit_date ?? null,
      refunded_at: invoice.refunded_at ?? null,
    });
  }
  return out;
}

export function summarizeSubscriptions(rows: SubscriptionLite[]): AdminSubscriptionSummary {
  const by_status: Record<string, number> = {};
  let mrr = 0;
  let live = 0;
  for (const row of rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + 1;
    if (row.status === "authorized") mrr += Number(row.plans?.price_brl ?? 0);
    if (LIVE_STATUSES.includes(row.status)) live += 1;
  }
  return { by_status, mrr_brl: Math.round(mrr * 100) / 100, live };
}

/** Masks a CPF to its last two digits; null when absent. */
export function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

/** A user is active unless they are banned until a still-future timestamp. */
export function isUserActive(bannedUntil: string | null | undefined, now: Date): boolean {
  if (!bannedUntil) return true;
  const until = Date.parse(bannedUntil);
  if (Number.isNaN(until)) return true;
  return until <= now.getTime();
}

/** Normalizes an RPC cost series (numeric values may arrive as strings). */
export function shapeSeries(rows: SeriesRow[]): { bucket: string; cost: number }[] {
  return rows.map((r) => ({ bucket: r.bucket, cost: Number(r.cost ?? 0) }));
}

/** Joins auth users (email/last sign-in/ban) with profile and spending data. */
export function mergeUserRows(
  authUsers: AuthUserLite[],
  profiles: ProfileLite[],
  spending: SpendingLite[],
  now: Date,
  subscriptions: SubscriptionLite[] = [],
  invoices: InvoiceLite[] = [],
): AdminUserRow[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const spendById = new Map(spending.map((s) => [s.user_id, Number(s.total_usd ?? 0)]));
  const lastChargeBySubscription = pickLastChargePerSubscription(invoices);
  const subscriptionById = pickSubscriptionPerUser(subscriptions, lastChargeBySubscription);

  return authUsers.map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      full_name: profile?.full_name ?? null,
      credit_balance: profile?.credit_balance ?? 0,
      plan_credits: profile?.plan_credits ?? 0,
      plan_period_end: profile?.plan_period_end ?? null,
      access_kind: profile?.access_kind ?? "subscriber",
      trial_started_at: profile?.trial_started_at ?? null,
      cpf_masked: maskCpf(profile?.cpf),
      total_usd: spendById.get(u.id) ?? 0,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at ?? null,
      is_active: isUserActive(u.banned_until, now),
      is_super_admin: profile?.is_super_admin ?? false,
      subscription: subscriptionById.get(u.id) ?? null,
    };
  });
}

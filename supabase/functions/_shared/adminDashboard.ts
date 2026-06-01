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
}

export interface SpendingLite {
  user_id: string;
  total_usd?: number | string | null;
}

export interface SeriesRow {
  bucket: string;
  cost: number | string | null;
}

export interface AdminUserRow {
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
): AdminUserRow[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const spendById = new Map(spending.map((s) => [s.user_id, Number(s.total_usd ?? 0)]));

  return authUsers.map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      full_name: profile?.full_name ?? null,
      credit_balance: profile?.credit_balance ?? 0,
      total_usd: spendById.get(u.id) ?? 0,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at ?? null,
      is_active: isUserActive(u.banned_until, now),
      is_super_admin: profile?.is_super_admin ?? false,
    };
  });
}

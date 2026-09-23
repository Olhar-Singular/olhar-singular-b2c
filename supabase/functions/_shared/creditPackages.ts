// Extra credit packages, read from public.credit_packages.
//
// The packages used to be a hardcoded whitelist here, duplicated in the UI. The
// table is now the single source of truth (prices change without a deploy); this
// module only decides which rows may be sold to whom, kept pure so the decision
// is unit-tested while the I/O stays in the edge function glue.

/** Row shape of public.credit_packages as PostgREST returns it. */
export interface CreditPackageRow {
  id: string;
  credits: number;
  // numeric columns arrive as strings through PostgREST.
  price_brl: number | string;
  label: string;
  active: boolean;
  admin_only: boolean;
}

/** What the checkouts and payment builders work with. */
export interface CreditPackage {
  id: string;
  credits: number;
  amountBrl: number;
  label: string;
  adminOnly: boolean;
}

export interface SelectPackageOptions {
  /** True only when the buyer is a super-admin (profiles.is_super_admin). */
  allowAdminOnly?: boolean;
}

export function toCreditPackage(row: CreditPackageRow): CreditPackage {
  return {
    id: row.id,
    credits: row.credits,
    amountBrl: Number(row.price_brl),
    label: row.label,
    adminOnly: row.admin_only,
  };
}

// Returns the sellable package with that id, or null when the id is not a
// string, is unknown, is inactive, or is admin_only and the buyer is not a
// super-admin. The price is never taken from the request: it comes from the row.
export function selectPackage(
  rows: CreditPackageRow[],
  id: unknown,
  options?: SelectPackageOptions,
): CreditPackage | null {
  if (typeof id !== "string" || !id) return null;
  const row = rows.find((r) => r.id === id);
  if (!row || !row.active) return null;
  if (row.admin_only && !options?.allowAdminOnly) return null;
  return toCreditPackage(row);
}

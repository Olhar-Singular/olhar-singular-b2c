// Prepaid Pix plans (1, 3 or 12 months paid at once), read from
// public.prepaid_plans. Same rule as creditPackages: the price and the credits
// always come from the row, never from the request; this module only decides
// which row may be sold to whom.

import { formatDateBr } from "./subscriptionEmails.ts";

/** Row shape of public.prepaid_plans as PostgREST returns it. */
export interface PrepaidPlanRow {
  id: string;
  slug: string;
  months: number;
  credits: number;
  // numeric columns arrive as strings through PostgREST.
  price_brl: number | string;
  active: boolean;
  admin_only: boolean;
}

export interface PrepaidPlan {
  id: string;
  slug: string;
  months: number;
  credits: number;
  priceBrl: number;
  adminOnly: boolean;
}

export function toPrepaidPlan(row: PrepaidPlanRow): PrepaidPlan {
  return {
    id: row.id,
    slug: row.slug,
    months: row.months,
    credits: row.credits,
    priceBrl: Number(row.price_brl),
    adminOnly: row.admin_only,
  };
}

// The sellable offer with that slug, or null (not a string, unknown, inactive,
// or admin-only for someone who is not a super-admin).
export function selectPrepaidPlan(
  rows: PrepaidPlanRow[],
  slug: unknown,
  options?: { allowAdminOnly?: boolean },
): PrepaidPlan | null {
  if (typeof slug !== "string" || !slug) return null;
  const row = rows.find((r) => r.slug === slug);
  if (!row || !row.active) return null;
  if (row.admin_only && !options?.allowAdminOnly) return null;
  return toPrepaidPlan(row);
}

/** "1 mês" / "3 meses". */
export function prepaidMonthsLabel(months: number): string {
  return months === 1 ? "1 mês" : `${months} meses`;
}

// What the buyer's bank app shows. Regular hyphen, not an em dash.
export function prepaidDescription(plan: Pick<PrepaidPlan, "months">): string {
  return `Plano à vista ${prepaidMonthsLabel(plan.months)} - Olhar Singular`;
}

/** 409 prepaid_active of the card checkout (R6): renew on Pix, or subscribe after the period. */
export function prepaidActiveMessage(untilIso: string): string {
  return `Você tem um plano à vista ativo até ${formatDateBr(new Date(untilIso))}. Para continuar, renove no Pix ou assine no cartão depois dessa data.`;
}

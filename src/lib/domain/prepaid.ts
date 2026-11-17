// Pix prepaid plans on the front (spec 2026-11-15-checkout-pix-a-vista): the
// catalogue view, the savings against the 1-month plan and the copy of the
// cards, summary and two-part release (R1). Pure, so components stay thin.

import { adaptationsPerMonth } from "@/lib/domain/checkoutCopy";
import { formatBrl } from "@/lib/domain/subscriptionUi";
import type { Database } from "@/integrations/supabase/types";

type PrepaidPlanRow = Database["public"]["Tables"]["prepaid_plans"]["Row"];

export interface PrepaidPlanView {
  id: string;
  slug: string;
  months: number;
  credits: number;
  priceBrl: number;
  highlight: boolean;
  adminOnly: boolean;
}

/** Mirror of the seeded `prepaid_plans` rows, for the first paint and the landing. */
export const DEFAULT_PREPAID_PLANS: PrepaidPlanView[] = [
  { id: "pix-1-mes",    slug: "pix-1-mes",    months: 1,  credits: 300,  priceBrl: 39.9,  highlight: false, adminOnly: false },
  { id: "pix-3-meses",  slug: "pix-3-meses",  months: 3,  credits: 900,  priceBrl: 89.9,  highlight: true,  adminOnly: false },
  { id: "pix-12-meses", slug: "pix-12-meses", months: 12, credits: 3600, priceBrl: 329.9, highlight: false, adminOnly: false },
];

/** A year or more reads as the school year, not as a count of adaptations. */
const SCHOOL_YEAR_MONTHS = 12;

const integer = new Intl.NumberFormat("pt-BR");

export function toPrepaidPlanView(
  row: Pick<PrepaidPlanRow, "id" | "slug" | "months" | "credits" | "price_brl" | "highlight" | "admin_only">,
): PrepaidPlanView {
  return {
    id: row.id,
    slug: row.slug,
    months: row.months,
    credits: row.credits,
    priceBrl: Number(row.price_brl),
    highlight: row.highlight,
    adminOnly: row.admin_only,
  };
}

/** Same rule as publicPlans: the admin smoke offer never shows on public copy. */
export function publicPrepaidPlans(plans: PrepaidPlanView[] | undefined): PrepaidPlanView[] {
  const visible = (plans ?? []).filter((p) => !p.adminOnly).sort((a, b) => a.months - b.months);
  return visible.length > 0 ? visible : DEFAULT_PREPAID_PLANS;
}

/** The shortest plan: what every other plan's savings are measured against. */
export function basePrepaidPlan(plans: PrepaidPlanView[]): PrepaidPlanView | null {
  return plans.reduce<PrepaidPlanView | null>((best, p) => (!best || p.months < best.months ? p : best), null);
}

/** "1 mês" / "3 meses". */
export function prepaidMonthsLabel(months: number): string {
  return months === 1 ? "1 mês" : `${months} meses`;
}

// Integer cents avoid float noise. The percentage rounds DOWN and the monthly
// price UP: the page never promises more than the buyer gets.
function monthlyCents(plan: PrepaidPlanView): number {
  return Math.ceil(Math.round(plan.priceBrl * 100) / plan.months);
}

export function prepaidSavings(plan: PrepaidPlanView, base: PrepaidPlanView): { percent: number; monthly: number } | null {
  if (plan.id === base.id) return null;
  const full = Math.round(base.priceBrl * 100) / base.months * plan.months;
  const paid = Math.round(plan.priceBrl * 100);
  return { percent: Math.floor((1 - paid / full) * 100), monthly: monthlyCents(plan) / 100 };
}

/** Same integer split as approve_prepaid_plan: one month's quota now, the rest on the 8th day. */
export function prepaidCreditsSplit(plan: Pick<PrepaidPlanView, "credits" | "months">): { now: number; later: number } {
  const now = Math.floor(plan.credits / plan.months);
  return { now, later: plan.credits - now };
}

export interface PrepaidCardLines {
  headline: string;
  price: string;
  credits: string;
  adaptations: string;
  savings: string | null;
  monthly: string;
}

export function prepaidCardLines(plan: PrepaidPlanView, base: PrepaidPlanView | null): PrepaidCardLines {
  const { min, max } = adaptationsPerMonth(plan.credits);
  const savings = base ? prepaidSavings(plan, base) : null;
  const monthly = formatBrl(monthlyCents(plan) / 100);
  return {
    headline: prepaidMonthsLabel(plan.months).toUpperCase(),
    price: formatBrl(plan.priceBrl),
    credits: `${integer.format(plan.credits)} créditos`,
    adaptations: plan.months >= SCHOOL_YEAR_MONTHS ? "o ano letivo inteiro" : `${min} a ${max} adaptações`,
    savings: savings ? `Economia de ${savings.percent}%` : null,
    monthly: base && !savings ? `Equivale a ${monthly} por mês` : `${monthly} por mês`,
  };
}

export function prepaidReleaseLabel(plan: PrepaidPlanView): string | null {
  const { now, later } = prepaidCreditsSplit(plan);
  if (later === 0) return null;
  return `${integer.format(now)} créditos entram na hora; os outros ${integer.format(later)} entram no 8º dia, depois do prazo de garantia.`;
}

export function prepaidSummary(plan: PrepaidPlanView): { access: string; credits: string; payToday: string; once: string } {
  return {
    access: `Acesso por ${prepaidMonthsLabel(plan.months)}`,
    credits: `${integer.format(plan.credits)} créditos`,
    payToday: formatBrl(plan.priceBrl),
    once: "Pagamento único. Nada é cobrado de novo sem você pedir.",
  };
}

export interface PrepaidPurchaseRow {
  plan_period_end: string | null;
  plan_locked_credits: number | null;
  plan_unlock_at: string | null;
  plan_released_at: string | null;
}

export interface ActivePrepaid {
  /** End of the whole prepaid period (a rebuy extends it, R7). */
  periodEnd: Date;
  /** Credits still waiting for the 8th day, across every running purchase. */
  lockedCredits: number;
  /** The next unlock, when something is still locked. */
  unlockAt: Date | null;
}

/** What the Créditos area shows from the user's approved plan purchases. */
export function activePrepaid(rows: PrepaidPurchaseRow[], now: Date): ActivePrepaid | null {
  let periodEnd: Date | null = null;
  let lockedCredits = 0;
  let unlockAt: Date | null = null;
  for (const row of rows) {
    if (!row.plan_period_end) continue;
    const end = new Date(row.plan_period_end);
    if (end <= now) continue;
    if (!periodEnd || end > periodEnd) periodEnd = end;
    if (row.plan_released_at || !row.plan_locked_credits || !row.plan_unlock_at) continue;
    lockedCredits += row.plan_locked_credits;
    const unlock = new Date(row.plan_unlock_at);
    if (!unlockAt || unlock < unlockAt) unlockAt = unlock;
  }
  return periodEnd ? { periodEnd, lockedCredits, unlockAt } : null;
}

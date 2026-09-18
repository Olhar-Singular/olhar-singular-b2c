import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AdminUser } from "@/types/admin";

/** Operational state of an account, as the support team reasons about it. */
export type AdminAccessState = "subscriber" | "past_due" | "trial" | "trial_card" | "trial_expired" | "exempt" | "legacy" | "blocked" | "inactive";

export const ACCESS_STATE_LABELS: Record<AdminAccessState, string> = {
  subscriber: "Assinante",
  past_due: "Inadimplente",
  trial: "Teste (convite)",
  trial_card: "Teste (cartão)",
  trial_expired: "Teste encerrado",
  exempt: "Cortesia",
  legacy: "Legado",
  blocked: "Sem créditos",
  inactive: "Inativo",
};

const CARD_TRIAL_LIVE_STATUSES = ["authorized", "past_due", "paused"];

/** A live subscription mid its 7-day card trial: the day-8 charge has not confirmed yet. */
export function isCardTrialUser(user: AdminUser): boolean {
  return (
    !!user.subscription &&
    CARD_TRIAL_LIVE_STATUSES.includes(user.subscription.status) &&
    !!user.subscription.trial_ends_at &&
    !user.subscription.first_payment_confirmed
  );
}

const KINDS = ["subscriber", "trial", "exempt", "legacy"] as const;

function planActive(user: AdminUser, now: Date): boolean {
  if (!user.plan_period_end) return false;
  const end = Date.parse(user.plan_period_end);
  return !Number.isNaN(end) && end > now.getTime();
}

/**
 * Derives the state shown in the admin table. Ban (is_active = false) wins;
 * then the kind; a trial past its end reads "trial_expired"; a non-exempt
 * account with nothing left in either bucket reads "blocked".
 */
export function adminAccessState(user: AdminUser, now: Date): AdminAccessState {
  if (!user.is_active) return "inactive";
  const kind = (KINDS as readonly string[]).includes(user.access_kind) ? (user.access_kind as (typeof KINDS)[number]) : "subscriber";
  if (kind === "exempt") return "exempt";
  // A failed renewal is the support case that matters most: it wins over the
  // credit math while the card is not fixed.
  if (kind === "subscriber" && user.subscription?.status === "past_due") return "past_due";
  const active = planActive(user, now);
  if (kind === "trial") {
    if (!active) return "trial_expired";
    if (isCardTrialUser(user)) return "trial_card";
    return "trial";
  }
  const available = (active ? user.plan_credits : 0) + user.credit_balance;
  if (available <= 0) return "blocked";
  return kind;
}

/** Plan credits still usable (0 when the period is over). */
export function adminPlanCredits(user: AdminUser, now: Date): number {
  return planActive(user, now) ? user.plan_credits : 0;
}

/** "até dd/MM/yyyy" for an active period, or null. */
export function formatPeriodEnd(user: AdminUser, now: Date): string | null {
  if (!planActive(user, now)) return null;
  return `até ${format(new Date(user.plan_period_end!), "dd/MM/yyyy", { locale: ptBR })}`;
}

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  authorized: "Ativa",
  past_due: "Cobrança falhou",
  paused: "Pausada",
  pending: "Em análise",
  cancelled: "Cancelada",
  rejected: "Recusada",
};

/** "Profissional · Ativa · próx. dd/MM" for the table; null when never subscribed. */
export function formatSubscription(user: AdminUser): { label: string; detail: string | null } | null {
  const sub = user.subscription;
  if (!sub) return null;
  const status = SUBSCRIPTION_STATUS_LABELS[sub.status] ?? sub.status;
  const label = sub.plan_name ? `${sub.plan_name} · ${status}` : status;
  const next = sub.next_payment_date ? Date.parse(sub.next_payment_date) : NaN;
  const detail = !Number.isNaN(next) && ["authorized", "past_due"].includes(sub.status)
    ? `próx. ${format(new Date(next), "dd/MM/yyyy", { locale: ptBR })}`
    : null;
  return { label, detail };
}

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "R$ 39,90 em dd/MM/yyyy" (+ " · estornada em dd/MM/yyyy" when refunded); null without a charge. */
export function formatLastCharge(user: AdminUser): string | null {
  const charge = user.subscription?.last_charge ?? null;
  if (!charge) return null;
  const debit = charge.debit_date ? Date.parse(charge.debit_date) : NaN;
  const debitPart = !Number.isNaN(debit) ? ` em ${format(new Date(debit), "dd/MM/yyyy", { locale: ptBR })}` : "";
  let result = `${formatBrl(charge.amount_brl)}${debitPart}`;
  const refunded = charge.refunded_at ? Date.parse(charge.refunded_at) : NaN;
  if (!Number.isNaN(refunded)) {
    result += ` · estornada em ${format(new Date(refunded), "dd/MM/yyyy", { locale: ptBR })}`;
  }
  return result;
}

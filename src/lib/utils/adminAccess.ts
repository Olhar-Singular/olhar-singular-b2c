import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AdminUser } from "@/types/admin";

/** Operational state of an account, as the support team reasons about it. */
export type AdminAccessState = "subscriber" | "past_due" | "trial" | "trial_expired" | "exempt" | "legacy" | "blocked" | "inactive";

export const ACCESS_STATE_LABELS: Record<AdminAccessState, string> = {
  subscriber: "Assinante",
  past_due: "Inadimplente",
  trial: "Teste",
  trial_expired: "Teste encerrado",
  exempt: "Cortesia",
  legacy: "Legado",
  blocked: "Sem créditos",
  inactive: "Inativo",
};

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

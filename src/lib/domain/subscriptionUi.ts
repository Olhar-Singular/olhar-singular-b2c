// Pure helpers behind the subscription UI (landing pricing, subscribe page,
// subscription card, access banner). Kept out of the component files so
// React fast refresh stays intact and the rules are unit-tested on their own.

import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Access } from "@/lib/domain/access";
import type { PlanView, SubscriptionStatus, SubscriptionView } from "@/hooks/useSubscription";

export function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: Date) {
  return format(value, "dd/MM/yyyy", { locale: ptBR });
}

// Mirror of the seeded `plans` rows, shown until the catalogue loads (and if it
// never does): the landing page must never render an empty pricing grid.
export const DEFAULT_PLANS: PlanView[] = [
  { id: "basico",       slug: "basico",       name: "Básico",       priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false },
  { id: "profissional", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, highlight: true,  adminOnly: false },
  { id: "avancado",     slug: "avancado",     name: "Avançado",     priceBrl: 99.9, monthlyCredits: 900, highlight: false, adminOnly: false },
];

// An adaptation costs 5 to 12 credits depending on the barrier (adaptationCost.ts).
export function adaptationsRange(credits: number): string {
  return `${Math.floor(credits / 12)} a ${Math.floor(credits / 5)} adaptações por mês`;
}

// The admin-only smoke plan is hidden on the landing page even for a logged-in
// super-admin: it is public copy, not a checkout.
export function publicPlans(plans: PlanView[] | undefined): PlanView[] {
  const visible = (plans ?? []).filter((p) => !p.adminOnly);
  return visible.length > 0 ? visible : DEFAULT_PLANS;
}

// Picks the plan from ?plano=, falling back to the highlighted one, then the first.
export function pickInitialPlan(plans: PlanView[], requestedSlug: string | null): PlanView | null {
  if (plans.length === 0) return null;
  return (
    plans.find((p) => p.slug === requestedSlug) ??
    plans.find((p) => p.highlight) ??
    plans[0]
  );
}

// Courtesy accounts have nothing to subscribe to, except the super-admin, who
// runs the R$1/month smoke plan against production (decision 30).
export function canSubscribe(access: Access | null, isSuperAdmin: boolean | null | undefined): boolean {
  if (!access) return false;
  return !access.unlimited || !!isSuperAdmin;
}

// Decision 5: subscribing replaces the plan/trial bucket, it never sums.
export function replacementNotice(access: Access | null): string | null {
  if (!access || access.planCredits <= 0 || !access.periodEnd) return null;
  const what = access.kind === "trial" ? "do período de teste" : "do plano atual";
  return `Você ainda tem ${access.planCredits} ${access.planCredits === 1 ? "crédito" : "créditos"} ${what} até ${formatDate(access.periodEnd)}. Ao assinar agora, eles são substituídos pelos créditos do novo plano. Seus créditos extras continuam.`;
}

// The CPF is the card holder's, collected once at checkout (decision 24): shown
// to its owner masked to the last two digits, never editable in the app.
export function maskCpfForOwner(cpf: string | null | undefined): string | null {
  if (!cpf || !/^\d{11}$/.test(cpf)) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

// Brand ids come from MP (master, visa, amex, elo, hipercard...).
export function formatCard(brand: string | null, lastFour: string | null): string | null {
  if (!brand && !lastFour) return null;
  const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Cartão";
  return lastFour ? `${name} final ${lastFour}` : name;
}

// A rejected attempt is worth a banner only while it is fresh: an old refusal
// the user walked away from must not haunt every page.
const REJECTED_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isRecentRejection(subscription: SubscriptionView | null | undefined, now: Date): boolean {
  if (!subscription || subscription.status !== "rejected" || !subscription.createdAt) return false;
  return now.getTime() - subscription.createdAt.getTime() < REJECTED_WINDOW_MS;
}

/** Trial with card (spec 2026-09-15, decision 1). Mirrors TRIAL_DAYS in _shared/mpPreapproval.ts. */
export const TRIAL_DAYS = 7;
export const TRIAL_CREDITS = 50;

// The trial runs on the cheapest public plan: the server decides (subscribeFlow),
// this mirror only feeds the copy. Null while the catalogue is empty.
export function cheapestPublicPlan(plans: PlanView[]): PlanView | null {
  return plans
    .filter((p) => !p.adminOnly)
    .reduce<PlanView | null>((best, p) => (best === null || p.priceBrl < best.priceBrl ? p : best), null);
}

// The date shown before the checkout; the server's trialEndsAt is the truth after it.
export function trialFirstChargeDate(now: Date): Date {
  return addDays(now, TRIAL_DAYS);
}

const LIVE_STATUSES: readonly SubscriptionStatus[] = ["authorized", "past_due", "paused"];

// A live subscription born as a trial that MP has not charged yet: the card,
// the banner and the cancel dialog read differently until the first charge.
export function isCardTrial(sub: SubscriptionView | null | undefined): boolean {
  return !!sub && LIVE_STATUSES.includes(sub.status) && sub.trialEndsAt !== null && !sub.firstPaymentConfirmed;
}

// Version of the Terms of Use the checkout records on the profile. Bump when
// the legal text changes; the pages under /termos show the same value.
export const TERMS_VERSION = "2026-09.2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AccountFormError = "name" | "email" | "email_mismatch" | "terms";

// Validation of the account step of the anonymous checkout; mirrors the server
// (parseAccountInput) so the user is stopped before the card is tokenized.
export function validateAccountForm(form: {
  fullName: string;
  email: string;
  emailConfirmation: string;
  acceptedTerms: boolean;
}): AccountFormError | null {
  if (form.fullName.trim().length < 2) return "name";
  const email = form.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return "email";
  if (email !== form.emailConfirmation.trim().toLowerCase()) return "email_mismatch";
  if (!form.acceptedTerms) return "terms";
  return null;
}

export const ACCOUNT_FORM_MESSAGES: Record<AccountFormError, string> = {
  name: "Informe seu nome completo.",
  email: "Informe um e-mail válido.",
  email_mismatch: "Os e-mails não coincidem. Confira antes de continuar: é por ele que você entra na plataforma.",
  terms: "É preciso aceitar os Termos de Uso e a Política de Privacidade.",
};

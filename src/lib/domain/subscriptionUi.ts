// Pure helpers behind the subscription UI (landing pricing, subscribe page,
// subscription card, access banner). Kept out of the component files so
// React fast refresh stays intact and the rules are unit-tested on their own.

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Access } from "@/lib/domain/access";
import type { PlanView, SubscriptionView } from "@/hooks/useSubscription";

export function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: Date) {
  return format(value, "dd/MM/yyyy", { locale: ptBR });
}

// Mirror of the seeded `plans` rows, shown until the catalogue loads (and if it
// never does): the landing page must never render an empty pricing grid.
export const DEFAULT_PLANS: PlanView[] = [
  { id: "basico",       slug: "basico",       name: "Básico",       priceBrl: 19.9, monthlyCredits: 60,  highlight: false, adminOnly: false },
  { id: "profissional", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 240, highlight: true,  adminOnly: false },
  { id: "avancado",     slug: "avancado",     name: "Avançado",     priceBrl: 99.9, monthlyCredits: 500, highlight: false, adminOnly: false },
];

// An adaptation costs 5 to 12 credits depending on the activity size.
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

// Decision 5: subscribing replaces the plan/trial bucket, it never sums.
export function replacementNotice(access: Access | null): string | null {
  if (!access || access.planCredits <= 0 || !access.periodEnd) return null;
  const what = access.kind === "trial" ? "do período de teste" : "do plano atual";
  return `Você ainda tem ${access.planCredits} ${access.planCredits === 1 ? "crédito" : "créditos"} ${what} até ${formatDate(access.periodEnd)}. Ao assinar agora, eles são substituídos pelos créditos do novo plano. Seus créditos extras continuam.`;
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

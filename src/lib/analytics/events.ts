// The events the funnel emits, typed once so pages cannot drift. GA4
// e-commerce names where they exist, custom names otherwise. event_id is the
// purchase / subscription id, which the server uses too, so GA4 and Meta can
// deduplicate browser and server hits.

import { pushEvent } from "@/lib/analytics/dataLayer";
import type { Consent } from "@/lib/analytics/consent";

export interface PlanItem {
  id: string;
  slug: string;
  name: string;
  priceBrl: number;
}

function planItem(plan: PlanItem) {
  return { item_id: plan.slug, item_name: plan.name, price: plan.priceBrl, quantity: 1, item_category: "plano" };
}

export function trackViewPlans(plans: PlanItem[]): void {
  pushEvent("view_item_list", {
    item_list_id: "planos",
    item_list_name: "Planos",
    items: plans.map(planItem),
  });
}

export function trackSelectPlan(plan: PlanItem): void {
  pushEvent("select_item", { item_list_id: "planos", items: [planItem(plan)] });
}

export function trackBeginCheckout(plan: PlanItem): void {
  pushEvent("begin_checkout", { currency: "BRL", value: plan.priceBrl, items: [planItem(plan)] });
}

export function trackAddPaymentInfo(plan: PlanItem): void {
  pushEvent("add_payment_info", { currency: "BRL", value: plan.priceBrl, payment_type: "card", items: [planItem(plan)] });
}

export function trackSubscriptionStarted(plan: PlanItem, subscriptionId: string, status: "authorized" | "pending"): void {
  pushEvent("subscription_started", {
    event_id: subscriptionId,
    transaction_id: subscriptionId,
    currency: "BRL",
    value: plan.priceBrl,
    status,
    items: [planItem(plan)],
  });
}

/** Trial with card: no money yet (value 0), same dedupe key as the subscription. */
export function trackTrialStarted(plan: PlanItem, subscriptionId: string, status: "authorized" | "pending"): void {
  pushEvent("trial_started", {
    event_id: subscriptionId,
    transaction_id: subscriptionId,
    currency: "BRL",
    value: 0,
    status,
    items: [planItem(plan)],
  });
}

/** Extras paid by card and approved on the spot (Pix lands via the server only). */
export function trackPurchase(pkg: { id: string; label: string; credits: number; amountBrl: number }, purchaseId: string): void {
  pushEvent("purchase", {
    event_id: purchaseId,
    transaction_id: purchaseId,
    currency: "BRL",
    value: pkg.amountBrl,
    items: [{ item_id: pkg.id, item_name: pkg.label, price: pkg.amountBrl, quantity: 1, item_category: "extras" }],
  });
}

export function trackPaywallShown(reason: "no_credits" | "trial_expired"): void {
  pushEvent("paywall_shown", { reason });
}

export function trackConsentUpdated(consent: Consent): void {
  pushEvent("consent_updated", { analytics: consent.analytics_storage, ads: consent.ad_storage });
}

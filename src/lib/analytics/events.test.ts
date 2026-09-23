import { describe, it, expect, beforeEach } from "vitest";
import { resetDataLayer } from "./dataLayer";
import { GRANTED_ALL } from "./consent";
import {
  trackAddPaymentInfo,
  trackBeginCheckout,
  trackConsentUpdated,
  trackPaywallShown,
  trackPurchase,
  trackSelectPlan,
  trackSubscriptionStarted,
  trackTrialStarted,
  trackViewPlans,
} from "./events";

const PRO = { id: "pl", slug: "profissional", name: "Profissional", priceBrl: 59.9 };

describe("funnel events", () => {
  beforeEach(() => resetDataLayer());

  it("emits the GA4 e-commerce sequence for a plan", () => {
    trackViewPlans([PRO]);
    trackSelectPlan(PRO);
    trackBeginCheckout(PRO);
    trackAddPaymentInfo(PRO);
    trackSubscriptionStarted(PRO, "sub-1", "authorized");
    expect(window.dataLayer?.map((e) => (e as { event: string }).event)).toEqual([
      "view_item_list", "select_item", "begin_checkout", "add_payment_info", "subscription_started",
    ]);
    expect(window.dataLayer?.[4]).toMatchObject({ event_id: "sub-1", transaction_id: "sub-1", value: 59.9, currency: "BRL", status: "authorized" });
    expect(window.dataLayer?.[0]).toMatchObject({ items: [{ item_id: "profissional", item_name: "Profissional", price: 59.9, item_category: "plano" }] });
  });

  it("trial_started carries the plan with value 0 and the subscription id as event_id", () => {
    window.dataLayer = [];
    trackTrialStarted({ id: "b", slug: "basico", name: "Básico", priceBrl: 39.9 }, "sub-1", "authorized");
    expect(window.dataLayer[0]).toMatchObject({
      event: "trial_started", event_id: "sub-1", transaction_id: "sub-1", currency: "BRL", value: 0, status: "authorized",
      items: [{ item_id: "basico", price: 39.9 }],
    });
  });

  it("emits purchase for extras, paywall and consent events", () => {
    trackPurchase({ id: "pkg", label: "Profissional", credits: 120, amountBrl: 29.9 }, "purchase-1");
    trackPaywallShown("no_credits");
    trackConsentUpdated(GRANTED_ALL);
    expect(window.dataLayer?.[0]).toMatchObject({ event: "purchase", event_id: "purchase-1", value: 29.9, items: [{ item_category: "extras" }] });
    expect(window.dataLayer?.[1]).toEqual({ event: "paywall_shown", reason: "no_credits" });
    expect(window.dataLayer?.[2]).toEqual({ event: "consent_updated", analytics: "granted", ads: "granted" });
  });
});

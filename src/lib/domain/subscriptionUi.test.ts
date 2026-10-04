import { describe, it, expect } from "vitest";
import {
  ACCOUNT_FORM_MESSAGES,
  ADAPTATION_COST_LABEL,
  DEFAULT_PACKAGES,
  DEFAULT_PLANS,
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
  adaptationsRange,
  canRefundLastCharge,
  canSubscribe,
  cheapestPublicPlan,
  formatBrl,
  formatCard,
  formatDate,
  isCardTrial,
  isRecentRejection,
  maskCpfForOwner,
  pickInitialPlan,
  publicPackages,
  publicPlans,
  replacementNotice,
  trialFirstChargeDate,
  validateAccountForm,
} from "@/lib/domain/subscriptionUi";
import { ADAPTATION_CREDITS } from "@/lib/domain/barriers";
import type { Access } from "@/lib/domain/access";
import type { CreditPackageView } from "@/hooks/useCredits";
import type { LastChargeView, PlanView, SubscriptionView } from "@/hooks/useSubscription";

const DAY_MS = 24 * 60 * 60 * 1000;

const plan = (over: Partial<PlanView> = {}): PlanView => ({
  id: "p",
  slug: "p",
  name: "Plano",
  priceBrl: 50,
  monthlyCredits: 100,
  highlight: false,
  adminOnly: false,
  ...over,
});

const access = (over: Partial<Access> = {}): Access => ({
  kind: "subscriber",
  planCredits: 300,
  extraCredits: 0,
  total: 300,
  unlimited: false,
  paywalled: false,
  periodEnd: new Date(2026, 9, 4),
  daysLeft: null,
  trialExpired: false,
  mustSetPassword: false,
  ...over,
});

const subscription = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  id: "s",
  status: "authorized",
  statusDetail: null,
  plan: null,
  nextPaymentDate: null,
  currentPeriodEnd: null,
  cancelledAt: null,
  cardBrand: null,
  cardLastFour: null,
  firstPaymentConfirmed: true,
  trialEndsAt: null,
  createdAt: null,
  ...over,
});

const charge = (over: Partial<LastChargeView> = {}): LastChargeView => ({
  id: "c",
  amountBrl: 39.9,
  debitDate: null,
  refundedAt: null,
  ...over,
});

describe("adaptationsRange", () => {
  it("estimates adaptations from the 5 to 12 credit cost", () => {
    expect(adaptationsRange(300)).toBe("25 a 60 adaptações por mês");
    expect(adaptationsRange(480)).toBe("40 a 96 adaptações por mês");
    expect(adaptationsRange(900)).toBe("75 a 180 adaptações por mês");
  });
});

describe("landing cost facts", () => {
  // These strings are read aloud on the landing page: if the cost table changes,
  // this fails and the copy must be reviewed together with it.
  it("labels the adaptation cost tiers from the real cost table", () => {
    expect(ADAPTATION_COST_LABEL).toBe(
      `${ADAPTATION_CREDITS.low}, ${ADAPTATION_CREDITS.medium} ou ${ADAPTATION_CREDITS.high}`,
    );
    expect(ADAPTATION_COST_LABEL).toBe("5, 8 ou 12");
  });

  it("derives the monthly range from the cheapest and dearest tier", () => {
    const { low, high } = ADAPTATION_CREDITS;
    expect(adaptationsRange(120)).toBe(`${Math.floor(120 / high)} a ${Math.floor(120 / low)} adaptações por mês`);
  });

  it("states the unused-extras refund window in days", () => {
    expect(EXTRAS_REFUND_DAYS).toBe(7);
  });
});

describe("publicPlans", () => {
  it("falls back to the seeded catalogue and hides admin-only plans", () => {
    expect(publicPlans(undefined)).toBe(DEFAULT_PLANS);
    expect(publicPlans([])).toBe(DEFAULT_PLANS);
    const smoke = { ...DEFAULT_PLANS[0], id: "t", slug: "teste-admin", adminOnly: true };
    expect(publicPlans([smoke])).toBe(DEFAULT_PLANS);
    expect(publicPlans([DEFAULT_PLANS[1], smoke])).toEqual([DEFAULT_PLANS[1]]);
  });
});

describe("DEFAULT_PACKAGES", () => {
  it("mirrors the seeded extra-credit packages, none of them admin-only", () => {
    expect(DEFAULT_PACKAGES.map((p) => [p.credits, p.amountBrl, p.highlight])).toEqual([
      [30, 9.9, false],
      [120, 29.9, true],
      [300, 59.9, false],
    ]);
    expect(DEFAULT_PACKAGES.every((p) => !p.adminOnly)).toBe(true);
  });

  it("gives every package a label and a distinct id", () => {
    expect(DEFAULT_PACKAGES.every((p) => p.label.length > 0)).toBe(true);
    expect(new Set(DEFAULT_PACKAGES.map((p) => p.id)).size).toBe(DEFAULT_PACKAGES.length);
  });
});

describe("publicPackages", () => {
  const row = (over: Partial<CreditPackageView>): CreditPackageView => ({
    id: "row",
    credits: 50,
    amountBrl: 14.9,
    label: "Extra",
    highlight: false,
    adminOnly: false,
    ...over,
  });

  it("falls back to the seeded catalogue while the rows are missing or empty", () => {
    expect(publicPackages(undefined)).toBe(DEFAULT_PACKAGES);
    expect(publicPackages([])).toBe(DEFAULT_PACKAGES);
  });

  it("falls back to the seeded catalogue when only admin-only rows remain", () => {
    expect(publicPackages([row({ id: "smoke", adminOnly: true })])).toBe(DEFAULT_PACKAGES);
  });

  it("keeps the real rows in order and drops the admin-only ones", () => {
    const a = row({ id: "a", credits: 40 });
    const smoke = row({ id: "smoke", credits: 1, adminOnly: true });
    const b = row({ id: "b", credits: 200, highlight: true });
    expect(publicPackages([a, smoke, b])).toEqual([a, b]);
  });
});

describe("formatBrl and formatDate", () => {
  it("formats money in pt-BR reais", () => {
    expect(formatBrl(39.9)).toMatch(/^R\$\s39,90$/);
    expect(formatBrl(1234.5)).toMatch(/^R\$\s1\.234,50$/);
  });

  it("formats dates as dd/MM/yyyy", () => {
    expect(formatDate(new Date(2026, 9, 4))).toBe("04/10/2026");
  });
});

describe("pickInitialPlan", () => {
  const cheap = plan({ id: "a", slug: "a" });
  const star = plan({ id: "b", slug: "b", highlight: true });

  it("returns null for an empty catalogue", () => {
    expect(pickInitialPlan([], "a")).toBeNull();
  });

  it("honors the requested slug", () => {
    expect(pickInitialPlan([cheap, star], "a")).toBe(cheap);
  });

  it("falls back to the highlighted plan when the slug is missing or unknown", () => {
    expect(pickInitialPlan([cheap, star], null)).toBe(star);
    expect(pickInitialPlan([cheap, star], "nope")).toBe(star);
  });

  it("falls back to the first plan when none is highlighted", () => {
    expect(pickInitialPlan([cheap, plan({ id: "c", slug: "c" })], null)).toBe(cheap);
  });
});

describe("canSubscribe", () => {
  it("is false without access", () => {
    expect(canSubscribe(null, true)).toBe(false);
  });

  it("is true for accounts that pay for their credits", () => {
    expect(canSubscribe(access(), false)).toBe(true);
    expect(canSubscribe(access(), null)).toBe(true);
  });

  it("blocks courtesy accounts except the super-admin", () => {
    const courtesy = access({ kind: "exempt", unlimited: true });
    expect(canSubscribe(courtesy, false)).toBe(false);
    expect(canSubscribe(courtesy, null)).toBe(false);
    expect(canSubscribe(courtesy, undefined)).toBe(false);
    expect(canSubscribe(courtesy, true)).toBe(true);
  });
});

describe("replacementNotice", () => {
  it("is null when there is nothing to replace", () => {
    expect(replacementNotice(null)).toBeNull();
    expect(replacementNotice(access({ planCredits: 0 }))).toBeNull();
    expect(replacementNotice(access({ periodEnd: null }))).toBeNull();
  });

  it("names the current plan, the amount and the date", () => {
    const text = replacementNotice(access({ planCredits: 300 }));
    expect(text).toContain("Você ainda tem 300 créditos do plano atual até 04/10/2026.");
    expect(text).toContain("eles são substituídos pelos créditos do novo plano");
    expect(text).toContain("Seus créditos extras continuam.");
  });

  it("names the trial period and uses the singular for one credit", () => {
    const text = replacementNotice(access({ kind: "trial", planCredits: 1 }));
    expect(text).toContain("Você ainda tem 1 crédito do período de teste até 04/10/2026.");
  });
});

describe("maskCpfForOwner", () => {
  it("masks all but the last two digits", () => {
    expect(maskCpfForOwner("12345678901")).toBe("***.***.***-01");
  });

  it("is null for a missing or malformed CPF", () => {
    expect(maskCpfForOwner(null)).toBeNull();
    expect(maskCpfForOwner(undefined)).toBeNull();
    expect(maskCpfForOwner("")).toBeNull();
    expect(maskCpfForOwner("123.456.789-01")).toBeNull();
    expect(maskCpfForOwner("1234567890")).toBeNull();
  });
});

describe("formatCard", () => {
  it("is null without brand and last digits", () => {
    expect(formatCard(null, null)).toBeNull();
  });

  it("capitalizes the brand and appends the last four", () => {
    expect(formatCard("visa", "4242")).toBe("Visa final 4242");
  });

  it("shows only the brand when the last four are unknown", () => {
    expect(formatCard("master", null)).toBe("Master");
  });

  it("falls back to a generic name when only the last four are known", () => {
    expect(formatCard(null, "4242")).toBe("Cartão final 4242");
  });
});

describe("isRecentRejection", () => {
  const now = new Date(2026, 9, 4, 12);

  it("is false without a rejected subscription carrying a date", () => {
    expect(isRecentRejection(null, now)).toBe(false);
    expect(isRecentRejection(undefined, now)).toBe(false);
    expect(isRecentRejection(subscription({ status: "authorized", createdAt: now }), now)).toBe(false);
    expect(isRecentRejection(subscription({ status: "rejected", createdAt: null }), now)).toBe(false);
  });

  it("is true inside the 24 hour window and false after it", () => {
    const fresh = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const stale = new Date(now.getTime() - DAY_MS);
    expect(isRecentRejection(subscription({ status: "rejected", createdAt: fresh }), now)).toBe(true);
    expect(isRecentRejection(subscription({ status: "rejected", createdAt: stale }), now)).toBe(false);
  });
});

describe("trial constants and dates", () => {
  it("mirrors the server trial: 7 days and 50 credits", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(TRIAL_CREDITS).toBe(50);
  });

  it("puts the first charge 7 days after the start", () => {
    expect(formatDate(trialFirstChargeDate(new Date(2026, 9, 4)))).toBe("11/10/2026");
  });
});

describe("cheapestPublicPlan", () => {
  it("is null for an empty catalogue or one with only admin-only plans", () => {
    expect(cheapestPublicPlan([])).toBeNull();
    expect(cheapestPublicPlan([plan({ adminOnly: true })])).toBeNull();
  });

  it("picks the lowest price regardless of order and ignores admin-only plans", () => {
    const low = plan({ id: "l", slug: "l", priceBrl: 39.9 });
    const mid = plan({ id: "m", slug: "m", priceBrl: 59.9 });
    const smoke = plan({ id: "s", slug: "s", priceBrl: 1, adminOnly: true });
    expect(cheapestPublicPlan([mid, low, smoke])).toBe(low);
    expect(cheapestPublicPlan([low, mid])).toBe(low);
  });

  it("breaks a price tie by slug, whatever the order", () => {
    const a = plan({ id: "a", slug: "a", priceBrl: 40 });
    const b = plan({ id: "b", slug: "b", priceBrl: 40 });
    expect(cheapestPublicPlan([b, a])).toBe(a);
    expect(cheapestPublicPlan([a, b])).toBe(a);
  });
});

describe("isCardTrial", () => {
  const trialEndsAt = new Date(2026, 9, 11);

  it("is false without a subscription", () => {
    expect(isCardTrial(null)).toBe(false);
    expect(isCardTrial(undefined)).toBe(false);
  });

  it("is false when the subscription is not live", () => {
    expect(isCardTrial(subscription({ status: "pending", trialEndsAt, firstPaymentConfirmed: false }))).toBe(false);
  });

  it("is false for a row that was paid from day one", () => {
    expect(isCardTrial(subscription({ trialEndsAt: null, firstPaymentConfirmed: false }))).toBe(false);
  });

  it("is false once the first charge is confirmed", () => {
    expect(isCardTrial(subscription({ trialEndsAt, firstPaymentConfirmed: true }))).toBe(false);
  });

  it("is true for a live trial that has not been charged yet", () => {
    expect(isCardTrial(subscription({ trialEndsAt, firstPaymentConfirmed: false }))).toBe(true);
  });
});

describe("validateAccountForm", () => {
  const valid = {
    fullName: "Maria Souza",
    email: "maria@escola.com",
    emailConfirmation: "maria@escola.com",
    acceptedTerms: true,
  };

  it("accepts a complete form", () => {
    expect(validateAccountForm(valid)).toBeNull();
  });

  it("rejects a name shorter than two characters, ignoring spaces", () => {
    expect(validateAccountForm({ ...valid, fullName: " a " })).toBe("name");
  });

  it("rejects a malformed e-mail", () => {
    expect(validateAccountForm({ ...valid, email: "maria@escola" })).toBe("email");
  });

  it("rejects mismatching e-mails but ignores case and surrounding spaces", () => {
    expect(validateAccountForm({ ...valid, emailConfirmation: "outra@escola.com" })).toBe("email_mismatch");
    expect(validateAccountForm({ ...valid, email: " Maria@Escola.com ", emailConfirmation: "MARIA@escola.com" })).toBeNull();
  });

  it("requires accepting the terms", () => {
    expect(validateAccountForm({ ...valid, acceptedTerms: false })).toBe("terms");
  });

  it("has a pt-BR message for every error", () => {
    expect(Object.keys(ACCOUNT_FORM_MESSAGES).sort()).toEqual(["email", "email_mismatch", "name", "terms"]);
    expect(Object.values(ACCOUNT_FORM_MESSAGES).every((m) => m.length > 0)).toBe(true);
  });
});

describe("canRefundLastCharge", () => {
  const now = new Date(2026, 9, 4, 12);

  it("is false without a subscription or a charge", () => {
    expect(canRefundLastCharge(null, charge(), now)).toBe(false);
    expect(canRefundLastCharge(subscription(), null, now)).toBe(false);
    expect(canRefundLastCharge(undefined, undefined, now)).toBe(false);
  });

  it("is false when the charge was already refunded", () => {
    expect(canRefundLastCharge(subscription(), charge({ refundedAt: now }), now)).toBe(false);
  });

  it("is true while the subscription is live", () => {
    for (const status of ["authorized", "past_due", "paused"] as const) {
      expect(canRefundLastCharge(subscription({ status }), charge(), now)).toBe(true);
    }
  });

  it("is true for a cancelled subscription inside the refund window and false after it", () => {
    const inside = new Date(now.getTime() - (REFUND_WINDOW_DAYS - 1) * DAY_MS);
    const outside = new Date(now.getTime() - REFUND_WINDOW_DAYS * DAY_MS);
    expect(canRefundLastCharge(subscription({ status: "cancelled", cancelledAt: inside }), charge(), now)).toBe(true);
    expect(canRefundLastCharge(subscription({ status: "cancelled", cancelledAt: outside }), charge(), now)).toBe(false);
  });

  it("is false for a cancelled subscription without a cancellation date", () => {
    expect(canRefundLastCharge(subscription({ status: "cancelled", cancelledAt: null }), charge(), now)).toBe(false);
  });

  it("is false for subscriptions that never reached a charge", () => {
    expect(canRefundLastCharge(subscription({ status: "pending" }), charge(), now)).toBe(false);
    expect(canRefundLastCharge(subscription({ status: "rejected" }), charge(), now)).toBe(false);
  });
});

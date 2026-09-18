import { describe, it, expect } from "vitest";
import { formatSubscription, adminAccessState, adminPlanCredits, formatPeriodEnd, formatLastCharge, isCardTrialUser, ACCESS_STATE_LABELS } from "./adminAccess";
import type { AdminUser } from "@/types/admin";

const NOW = new Date("2026-09-12T12:00:00Z");

function user(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    email: "a@x.com",
    full_name: "Ana",
    credit_balance: 0,
    plan_credits: 0,
    plan_period_end: null,
    access_kind: "subscriber",
    trial_started_at: null,
    cpf_masked: null,
    total_usd: 0,
    last_sign_in_at: null,
    created_at: null,
    is_active: true,
    is_super_admin: false,
    ...overrides,
  };
}

describe("adminAccessState", () => {
  it("ban wins over everything", () => {
    expect(adminAccessState(user({ is_active: false, access_kind: "exempt" }), NOW)).toBe("inactive");
  });

  it("exempt is exempt regardless of balances", () => {
    expect(adminAccessState(user({ access_kind: "exempt" }), NOW)).toBe("exempt");
  });

  it("a trial with an active period is a trial; past its end it is expired", () => {
    expect(adminAccessState(user({ access_kind: "trial", plan_credits: 50, plan_period_end: "2026-09-20T00:00:00Z" }), NOW)).toBe("trial");
    expect(adminAccessState(user({ access_kind: "trial", plan_credits: 50, plan_period_end: "2026-09-01T00:00:00Z" }), NOW)).toBe("trial_expired");
    expect(adminAccessState(user({ access_kind: "trial" }), NOW)).toBe("trial_expired");
  });

  it("a subscriber or legacy account with nothing left is blocked", () => {
    expect(adminAccessState(user({ access_kind: "legacy", credit_balance: 0 }), NOW)).toBe("blocked");
    expect(adminAccessState(user({ access_kind: "subscriber", plan_credits: 10, plan_period_end: "2026-09-01T00:00:00Z" }), NOW)).toBe("blocked");
  });

  it("returns the kind when credits are available", () => {
    expect(adminAccessState(user({ access_kind: "legacy", credit_balance: 3 }), NOW)).toBe("legacy");
    expect(adminAccessState(user({ access_kind: "subscriber", plan_credits: 10, plan_period_end: "2026-09-20T00:00:00Z" }), NOW)).toBe("subscriber");
  });

  it("treats an unknown kind as subscriber and an unparseable period as inactive", () => {
    expect(adminAccessState(user({ access_kind: "weird", credit_balance: 1 }), NOW)).toBe("subscriber");
    expect(adminAccessState(user({ access_kind: "trial", plan_period_end: "nope" }), NOW)).toBe("trial_expired");
  });

  it("has a pt-BR label for every state", () => {
    for (const label of Object.values(ACCESS_STATE_LABELS)) expect(label.length).toBeGreaterThan(2);
  });
});

describe("adminPlanCredits / formatPeriodEnd", () => {
  it("reports plan credits only while the period is active", () => {
    expect(adminPlanCredits(user({ plan_credits: 9, plan_period_end: "2026-09-20T00:00:00Z" }), NOW)).toBe(9);
    expect(adminPlanCredits(user({ plan_credits: 9, plan_period_end: "2026-09-01T00:00:00Z" }), NOW)).toBe(0);
    expect(adminPlanCredits(user({ plan_credits: 9 }), NOW)).toBe(0);
  });

  it("formats the period end in pt-BR or returns null", () => {
    expect(formatPeriodEnd(user({ plan_period_end: "2026-09-20T12:00:00Z" }), NOW)).toBe("até 20/09/2026");
    expect(formatPeriodEnd(user({ plan_period_end: "2026-09-01T00:00:00Z" }), NOW)).toBeNull();
    expect(formatPeriodEnd(user(), NOW)).toBeNull();
  });
});

describe("subscriptions in the admin table", () => {
  const sub = (overrides: Partial<NonNullable<AdminUser["subscription"]>> = {}) => ({
    status: "authorized", plan_name: "Profissional", price_brl: 59.9,
    next_payment_date: "2026-10-12T12:00:00Z", current_period_end: null, mp_preapproval_id: "p",
    trial_ends_at: null, first_payment_confirmed: true, last_charge: null,
    ...overrides,
  });

  it("a subscriber with a failed renewal reads Inadimplente, whatever the credits", () => {
    expect(adminAccessState(user({ access_kind: "subscriber", plan_credits: 100, plan_period_end: "2099-01-01T00:00:00Z", subscription: sub({ status: "past_due" }) }), NOW)).toBe("past_due");
    expect(adminAccessState(user({ access_kind: "legacy", credit_balance: 3, subscription: sub({ status: "past_due" }) }), NOW)).toBe("legacy");
    expect(adminAccessState(user({ access_kind: "subscriber", plan_credits: 100, plan_period_end: "2099-01-01T00:00:00Z", subscription: sub() }), NOW)).toBe("subscriber");
    expect(ACCESS_STATE_LABELS.past_due).toBe("Inadimplente");
  });

  it("formats plan, status and next charge", () => {
    expect(formatSubscription(user({ subscription: sub() }))).toEqual({ label: "Profissional · Ativa", detail: "próx. 12/10/2026" });
    expect(formatSubscription(user({ subscription: sub({ status: "cancelled" }) }))).toEqual({ label: "Profissional · Cancelada", detail: null });
    expect(formatSubscription(user({ subscription: sub({ plan_name: null, status: "weird", next_payment_date: "garbage" }) }))).toEqual({ label: "weird", detail: null });
    expect(formatSubscription(user({ subscription: sub({ next_payment_date: null }) }))).toEqual({ label: "Profissional · Ativa", detail: null });
    expect(formatSubscription(user())).toBeNull();
  });

  describe("isCardTrialUser", () => {
    it("is true for a live subscription mid card trial, not yet confirmed", () => {
      expect(isCardTrialUser(user({
        subscription: sub({ status: "authorized", trial_ends_at: "2026-09-25T00:00:00Z", first_payment_confirmed: false }),
      }))).toBe(true);
      expect(isCardTrialUser(user({
        subscription: sub({ status: "past_due", trial_ends_at: "2026-09-25T00:00:00Z", first_payment_confirmed: false }),
      }))).toBe(true);
      expect(isCardTrialUser(user({
        subscription: sub({ status: "paused", trial_ends_at: "2026-09-25T00:00:00Z", first_payment_confirmed: false }),
      }))).toBe(true);
    });

    it("is false once the first payment is confirmed", () => {
      expect(isCardTrialUser(user({
        subscription: sub({ trial_ends_at: "2026-09-25T00:00:00Z", first_payment_confirmed: true }),
      }))).toBe(false);
    });

    it("is false without a trial_ends_at (a plain subscription)", () => {
      expect(isCardTrialUser(user({ subscription: sub({ trial_ends_at: null, first_payment_confirmed: false }) }))).toBe(false);
    });

    it("is false for a closed subscription status or no subscription at all", () => {
      expect(isCardTrialUser(user({
        subscription: sub({ status: "cancelled", trial_ends_at: "2026-09-25T00:00:00Z", first_payment_confirmed: false }),
      }))).toBe(false);
      expect(isCardTrialUser(user())).toBe(false);
    });
  });

  it("reads a live authorized/past_due/paused trial with an unconfirmed card as Teste (cartão)", () => {
    const cardTrial = (status: string) => user({
      access_kind: "trial", plan_credits: 50, plan_period_end: "2026-09-20T00:00:00Z",
      subscription: sub({ status, trial_ends_at: "2026-09-19T00:00:00Z", first_payment_confirmed: false }),
    });
    expect(adminAccessState(cardTrial("authorized"), NOW)).toBe("trial_card");
    expect(adminAccessState(cardTrial("past_due"), NOW)).toBe("trial_card");
    expect(adminAccessState(cardTrial("paused"), NOW)).toBe("trial_card");
    expect(ACCESS_STATE_LABELS.trial_card).toBe("Teste (cartão)");
    expect(ACCESS_STATE_LABELS.trial).toBe("Teste (convite)");
  });

  it("keeps the invite trial (trial) when the card trial has already been confirmed or expired", () => {
    expect(adminAccessState(user({
      access_kind: "trial", plan_credits: 50, plan_period_end: "2026-09-20T00:00:00Z",
      subscription: sub({ status: "authorized", trial_ends_at: "2026-09-19T00:00:00Z", first_payment_confirmed: true }),
    }), NOW)).toBe("trial");
    // No plan_period_end active -> trial_expired wins regardless of the card trial.
    expect(adminAccessState(user({
      access_kind: "trial",
      subscription: sub({ status: "authorized", trial_ends_at: "2026-09-19T00:00:00Z", first_payment_confirmed: false }),
    }), NOW)).toBe("trial_expired");
  });
});

describe("formatLastCharge", () => {
  const sub = (overrides: Partial<NonNullable<AdminUser["subscription"]>> = {}) => ({
    status: "authorized", plan_name: "Profissional", price_brl: 59.9,
    next_payment_date: null, current_period_end: null, mp_preapproval_id: "p",
    trial_ends_at: null, first_payment_confirmed: true, last_charge: null,
    ...overrides,
  });

  it("formats the amount and the debit date", () => {
    expect(formatLastCharge(user({
      subscription: sub({ last_charge: { amount_brl: 39.9, debit_date: "2026-09-12T00:00:00Z", refunded_at: null } }),
    }))).toMatch(/^R\$\s*39,90 em 12\/09\/2026$/);
  });

  it("appends the refund date when the charge was refunded", () => {
    expect(formatLastCharge(user({
      subscription: sub({ last_charge: { amount_brl: 39.9, debit_date: "2026-09-12T00:00:00Z", refunded_at: "2026-09-13T00:00:00Z" } }),
    }))).toMatch(/^R\$\s*39,90 em 12\/09\/2026 · estornada em 13\/09\/2026$/);
  });

  it("returns null when there is no charge yet", () => {
    expect(formatLastCharge(user({ subscription: sub({ last_charge: null }) }))).toBeNull();
    expect(formatLastCharge(user())).toBeNull();
  });

  it("tolerates an old backend that omits last_charge entirely (not even null)", () => {
    const legacySub: NonNullable<AdminUser["subscription"]> = {
      status: "authorized", plan_name: "Profissional", price_brl: 59.9,
      next_payment_date: null, current_period_end: null, mp_preapproval_id: "p",
      trial_ends_at: null, first_payment_confirmed: true,
    };
    expect(formatLastCharge(user({ subscription: legacySub }))).toBeNull();
  });

  it("omits the date fragment when a charge has no debit_date", () => {
    expect(formatLastCharge(user({
      subscription: sub({ last_charge: { amount_brl: 39.9, debit_date: null, refunded_at: null } }),
    }))).toMatch(/^R\$\s*39,90$/);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { WebhookOutcome } from "./subscriptionActions";
import {
  CONFIRMATION_RESULTS,
  subscriptionToConfirm,
  sendConfirmationAfterWebhook,
  type WebhookConfirmationDeps,
  type WebhookSubscriptionRaw,
} from "./webhookConfirmation";

const SUB_ID = "5f3b2c1a-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-14T14:00:00Z");
const handled = (result: string): WebhookOutcome => ({ handled: true, result, subscriptionId: SUB_ID });

function raw(overrides: Partial<WebhookSubscriptionRaw> = {}): WebhookSubscriptionRaw {
  return {
    account_email: "ana@example.com",
    payer_email: "cartao@example.com",
    trial_ends_at: null,
    current_period_start: null,
    plan: { name: "Profissional", price_brl: "59.90", monthly_credits: 480 },
    profile: { full_name: "Ana Souza", terms_version: "2026-10.2" },
    ...overrides,
  };
}

function deps(row: WebhookSubscriptionRaw | null = raw(), overrides: Partial<WebhookConfirmationDeps> = {}) {
  const d = {
    loadSubscription: vi.fn(async () => row),
    send: vi.fn(async () => ({ ok: true as const, id: "msg_1" })),
    log: vi.fn(),
    appUrl: "https://professor.olharsingular.com",
    now: () => NOW,
    ...overrides,
  };
  return d as WebhookConfirmationDeps & typeof d;
}

describe("subscriptionToConfirm", () => {
  it("names the subscription when the webhook made it live: activated (pending since the checkout) or reactivated (paid again after closing)", () => {
    expect(CONFIRMATION_RESULTS).toEqual(["activated", "reactivated"]);
    expect(subscriptionToConfirm(handled("activated"))).toBe(SUB_ID);
    expect(subscriptionToConfirm(handled("reactivated"))).toBe(SUB_ID);
  });

  it("is null for a replay, for rows already live at the checkout, for orphans and for anything not handled", () => {
    for (const result of ["unchanged", "first_payment_confirmed", "trial_converted", "renewed", "same_period", "resumed", "paused", "cancelled", "clawback", "past_due", "already_processed", "pending", "ignored", "closed", "refund_mirrored", "refunded_externally", "paid_while_closed", "duplicate_live_subscription"]) {
      expect(subscriptionToConfirm(handled(result))).toBeNull();
    }
    expect(subscriptionToConfirm({ handled: false, reason: "unknown_subscription" })).toBeNull();
    expect(subscriptionToConfirm({ handled: false, reason: "provider_unavailable" })).toBeNull();
    expect(subscriptionToConfirm({ handled: true, result: undefined, subscriptionId: SUB_ID })).toBeNull();
  });
});

describe("sendConfirmationAfterWebhook", () => {
  it("[caso 1: pending no checkout → activated no webhook] sends the contract confirmation once, to the account e-mail, with plan, terms and no trial", async () => {
    const d = deps();
    await expect(sendConfirmationAfterWebhook(handled("activated"), d)).resolves.toBe("sent");

    expect(d.loadSubscription).toHaveBeenCalledWith(SUB_ID);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith({
      to: "ana@example.com",
      fullName: "Ana Souza",
      planName: "Profissional",
      priceBrl: 59.9,
      monthlyCredits: 480,
      trial: false,
      trialEndsAt: null,
      chargedAt: NOW,
      termsVersion: "2026-10.2",
      appUrl: "https://professor.olharsingular.com",
    });
    expect(d.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail sent", SUB_ID, "msg_1");
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("ana@example.com");
  });

  it("[caso 1b: reactivated] a closed row paid again is a new contract: sends with the debit date as the contract date, never as a trial", async () => {
    // renew_subscription writes current_period_start = COALESCE(debit_date, now()) on a reactivation.
    const d = deps(raw({ trial_ends_at: "2026-10-21T02:30:00+00:00", current_period_start: "2026-10-13T11:45:00+00:00" }));
    await expect(sendConfirmationAfterWebhook(handled("reactivated"), d)).resolves.toBe("sent");
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "ana@example.com", trial: false, trialEndsAt: null, chargedAt: new Date("2026-10-13T11:45:00Z"), termsVersion: "2026-10.2", planName: "Profissional",
    }));
    expect(d.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail sent", SUB_ID, "msg_1");
  });

  it("falls back to the webhook clock when a reactivation has no period start, and never uses the column for an activation", async () => {
    const noStart = deps(raw({ current_period_start: null }));
    await sendConfirmationAfterWebhook(handled("reactivated"), noStart);
    expect(noStart.send).toHaveBeenCalledWith(expect.objectContaining({ chargedAt: NOW }));

    const activated = deps(raw({ current_period_start: "2026-10-13T11:45:00+00:00" }));
    await sendConfirmationAfterWebhook(handled("activated"), activated);
    expect(activated.send).toHaveBeenCalledWith(expect.objectContaining({ chargedAt: NOW }));
  });

  it("falls back to the card's payer_email when the account has no e-mail", async () => {
    const d = deps(raw({ account_email: null }));
    await sendConfirmationAfterWebhook(handled("activated"), d);
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ to: "cartao@example.com" }));
  });

  it("marks a trial from trial_ends_at and tolerates a profile without name or terms", async () => {
    const d = deps(raw({ trial_ends_at: "2026-10-21T02:30:00+00:00", profile: { full_name: null, terms_version: null } }));
    await expect(sendConfirmationAfterWebhook(handled("activated"), d)).resolves.toBe("sent");
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({
      trial: true, trialEndsAt: new Date("2026-10-21T02:30:00Z"), fullName: null, termsVersion: null,
    }));
    const noProfile = deps(raw({ profile: null }));
    await sendConfirmationAfterWebhook(handled("activated"), noProfile);
    expect(noProfile.send).toHaveBeenCalledWith(expect.objectContaining({ fullName: null, termsVersion: null }));
  });

  it("[caso 2: reprocessamento do mesmo webhook] a replay comes back as unchanged and sends nothing", async () => {
    const d = deps();
    await expect(sendConfirmationAfterWebhook(handled("unchanged"), d)).resolves.toBe("skipped");
    expect(d.loadSubscription).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("[caso 3: assinatura autorizada no checkout, e órfãos] later webhooks never produce a second e-mail", async () => {
    for (const result of ["first_payment_confirmed", "trial_converted", "renewed", "same_period", "paid_while_closed", "duplicate_live_subscription", "already_processed"]) {
      const d = deps();
      await expect(sendConfirmationAfterWebhook(handled(result), d)).resolves.toBe("skipped");
      expect(d.loadSubscription).not.toHaveBeenCalled();
      expect(d.send).not.toHaveBeenCalled();
    }
    const unhandled = deps();
    await expect(sendConfirmationAfterWebhook({ handled: false, reason: "invalid_payload" }, unhandled)).resolves.toBe("skipped");
    expect(unhandled.send).not.toHaveBeenCalled();
  });

  it("reports not_found when the row or its plan cannot be read, without sending", async () => {
    const missing = deps(null);
    await expect(sendConfirmationAfterWebhook(handled("activated"), missing)).resolves.toBe("not_found");
    expect(missing.send).not.toHaveBeenCalled();
    expect(missing.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail skipped, subscription or plan not found", SUB_ID);

    const planless = deps(raw({ plan: null }));
    await expect(sendConfirmationAfterWebhook(handled("activated"), planless)).resolves.toBe("not_found");
    expect(planless.send).not.toHaveBeenCalled();
  });

  it("reports a refused send with its reason and never throws, even when a dep explodes", async () => {
    const refused = deps(raw(), { send: vi.fn(async () => ({ ok: false as const, reason: "http_422" as const })) });
    await expect(sendConfirmationAfterWebhook(handled("activated"), refused)).resolves.toBe("failed");
    expect(refused.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail not sent", SUB_ID, "http_422");

    const exploding = deps(raw(), { loadSubscription: vi.fn(async () => { throw new Error("db down for ana@example.com"); }) });
    await expect(sendConfirmationAfterWebhook(handled("activated"), exploding)).resolves.toBe("failed");
    expect(exploding.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail failed", SUB_ID, "Error");
    expect(JSON.stringify(exploding.log.mock.calls)).not.toContain("ana@example.com");

    const weird = deps(raw(), { send: vi.fn(async () => { throw "weird"; }) });
    await expect(sendConfirmationAfterWebhook(handled("activated"), weird)).resolves.toBe("failed");
    expect(weird.log).toHaveBeenCalledWith("mp-webhook: confirmation e-mail failed", SUB_ID, "string");
  });

  it("uses the wall clock when no clock is injected", async () => {
    const d = deps(raw(), { now: undefined });
    const before = Date.now();
    await sendConfirmationAfterWebhook(handled("activated"), d);
    const chargedAt = (d.send.mock.calls[0][0] as { chargedAt: Date }).chargedAt;
    expect(chargedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(chargedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

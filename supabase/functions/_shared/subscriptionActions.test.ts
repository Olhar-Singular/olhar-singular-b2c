import { describe, it, expect, vi } from "vitest";
import {
  handleSubscriptionWebhook,
  runCancelSubscription,
  runUpdateSubscriptionCard,
  type SubscriptionActionDeps,
  type SubscriptionWebhookDeps,
} from "./subscriptionActions";

function actionDeps(overrides: Partial<SubscriptionActionDeps> = {}) {
  const d = {
    findLiveSubscription: vi.fn(async () => ({ id: "sub-1", mp_preapproval_id: "pre-1", status: "authorized" })),
    putPreapproval: vi.fn(async () => ({ ok: true, status: 200, json: { id: "pre-1", status: "cancelled", payment_method_id: "visa" } })),
    cancelLocal: vi.fn(async () => ({ success: true })),
    updateCard: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
  return d as SubscriptionActionDeps & typeof d;
}

describe("runCancelSubscription", () => {
  it("cancels at MP first, then locally, keeping the paid period", async () => {
    const d = actionDeps();
    const result = await runCancelSubscription({ userId: "u1" }, d);
    expect(d.putPreapproval).toHaveBeenCalledWith("pre-1", { status: "cancelled" });
    expect(d.cancelLocal).toHaveBeenCalledWith("sub-1");
    expect(result).toEqual({ ok: true, subscriptionId: "sub-1" });
  });

  it("refuses when the user has no live subscription", async () => {
    const d = actionDeps({ findLiveSubscription: vi.fn(async () => null) });
    expect(await runCancelSubscription({ userId: "u1" }, d)).toEqual({ ok: false, error: "no_subscription", httpStatus: 404 });
    expect(d.putPreapproval).not.toHaveBeenCalled();
  });

  it("does not cancel locally when MP refuses (the charge would keep coming)", async () => {
    const d = actionDeps({ putPreapproval: vi.fn(async () => ({ ok: false, status: 400, json: { message: "nope" } })) });
    expect(await runCancelSubscription({ userId: "u1" }, d)).toEqual({ ok: false, error: "provider_error", httpStatus: 502 });
    expect(d.cancelLocal).not.toHaveBeenCalled();
  });

  it("cancels locally without calling MP when the row never got a preapproval id", async () => {
    const d = actionDeps({ findLiveSubscription: vi.fn(async () => ({ id: "sub-1", mp_preapproval_id: null, status: "paused" })) });
    const result = await runCancelSubscription({ userId: "u1" }, d);
    expect(d.putPreapproval).not.toHaveBeenCalled();
    expect(d.cancelLocal).toHaveBeenCalledWith("sub-1");
    expect(result).toEqual({ ok: true, subscriptionId: "sub-1" });
  });
});

describe("runUpdateSubscriptionCard", () => {
  it("sends the new card token to MP and mirrors the brand and last four", async () => {
    const d = actionDeps();
    const result = await runUpdateSubscriptionCard({ userId: "u1", cardToken: "tok_new", cardLastFour: "4321" }, d);
    expect(d.putPreapproval).toHaveBeenCalledWith("pre-1", { card_token_id: "tok_new" });
    expect(d.updateCard).toHaveBeenCalledWith({ subscriptionId: "sub-1", cardBrand: "visa", cardLastFour: "4321" });
    expect(result).toEqual({ ok: true, subscriptionId: "sub-1" });
  });

  it("refuses without a live subscription or a preapproval id", async () => {
    expect(
      await runUpdateSubscriptionCard({ userId: "u1", cardToken: "t", cardLastFour: null }, actionDeps({ findLiveSubscription: vi.fn(async () => null) })),
    ).toEqual({ ok: false, error: "no_subscription", httpStatus: 404 });
    expect(
      await runUpdateSubscriptionCard(
        { userId: "u1", cardToken: "t", cardLastFour: null },
        actionDeps({ findLiveSubscription: vi.fn(async () => ({ id: "s", mp_preapproval_id: null, status: "pending" })) }),
      ),
    ).toEqual({ ok: false, error: "no_subscription", httpStatus: 404 });
  });

  it("reports a provider error when MP rejects the new card", async () => {
    const d = actionDeps({ putPreapproval: vi.fn(async () => ({ ok: false, status: 400, json: { message: "invalid token" } })) });
    expect(await runUpdateSubscriptionCard({ userId: "u1", cardToken: "t", cardLastFour: null }, d)).toEqual({
      ok: false,
      error: "provider_error",
      httpStatus: 502,
    });
    expect(d.updateCard).not.toHaveBeenCalled();
  });

  it("keeps the previous brand when MP omits payment_method_id", async () => {
    const d = actionDeps({ putPreapproval: vi.fn(async () => ({ ok: true, status: 200, json: { id: "pre-1" } })) });
    await runUpdateSubscriptionCard({ userId: "u1", cardToken: "t", cardLastFour: null }, d);
    expect(d.updateCard).toHaveBeenCalledWith({ subscriptionId: "sub-1", cardBrand: null, cardLastFour: null });
  });
});

const SUB_ID = "0f6a2c2e-6d7b-4d0e-9a4b-1c2d3e4f5a6b";

function webhookDeps(overrides: Partial<SubscriptionWebhookDeps> = {}) {
  const d = {
    fetchPreapproval: vi.fn(async () => ({ id: "pre-1", status: "authorized", external_reference: SUB_ID.toUpperCase(), next_payment_date: "2026-10-12T00:00:00Z" })),
    fetchAuthorizedPayment: vi.fn(async () => ({
      id: 77, preapproval_id: "pre-1", external_reference: SUB_ID, status: "processed",
      debit_date: "2026-10-12T00:00:00Z", transaction_amount: 59.9, payment: { id: 900, status: "approved" },
    })),
    findSubscriptionByPreapproval: vi.fn(async () => ({ id: "sub-1" })),
    syncStatus: vi.fn(async () => "unchanged"),
    renew: vi.fn(async () => "renewed"),
    log: vi.fn(),
    ...overrides,
  };
  return d as SubscriptionWebhookDeps & typeof d;
}

describe("handleSubscriptionWebhook", () => {
  it("mirrors the preapproval topic via sync_subscription_status, resolving the row by external_reference", async () => {
    const d = webhookDeps();
    const out = await handleSubscriptionWebhook({ topic: "subscription_preapproval", id: "pre-1" }, d);
    expect(d.fetchPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.findSubscriptionByPreapproval).not.toHaveBeenCalled();
    expect(d.syncStatus).toHaveBeenCalledWith({
      subscriptionId: SUB_ID, preapprovalId: "pre-1", mpStatus: "authorized", nextPaymentDate: "2026-10-12T00:00:00Z",
    });
    expect(out).toEqual({ handled: true, result: "unchanged", subscriptionId: SUB_ID });
  });

  it("falls back to the preapproval id when the external_reference is missing or foreign", async () => {
    const d = webhookDeps({
      fetchPreapproval: vi.fn(async () => ({ status: "cancelled", external_reference: null })),
    });
    await handleSubscriptionWebhook({ topic: "subscription_preapproval", id: "pre-1" }, d);
    expect(d.findSubscriptionByPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.syncStatus).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub-1", preapprovalId: "pre-1", mpStatus: "cancelled" }));

    const foreign = webhookDeps({
      fetchPreapproval: vi.fn(async () => ({ id: 42, external_reference: "order-from-another-system" })),
    });
    await handleSubscriptionWebhook({ topic: "subscription_preapproval", id: "42" }, foreign);
    expect(foreign.findSubscriptionByPreapproval).toHaveBeenCalledWith("42");
    expect(foreign.syncStatus).toHaveBeenCalledWith(expect.objectContaining({ preapprovalId: "42", mpStatus: "unknown" }));
  });

  it("ignores a charge that names neither a known preapproval nor one of our ids", async () => {
    const d = webhookDeps({
      fetchAuthorizedPayment: vi.fn(async () => ({ id: 5, external_reference: "not-ours", status: "processed" })),
    });
    expect(await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "5" }, d)).toEqual({ handled: false, reason: "unknown_subscription" });
    expect(d.findSubscriptionByPreapproval).not.toHaveBeenCalled();
  });

  it("ignores a preapproval we do not know", async () => {
    const d = webhookDeps({
      fetchPreapproval: vi.fn(async () => ({ id: "pre-x", status: "authorized", external_reference: null })),
      findSubscriptionByPreapproval: vi.fn(async () => null),
    });
    expect(await handleSubscriptionWebhook({ topic: "subscription_preapproval", id: "pre-x" }, d)).toEqual({ handled: false, reason: "unknown_subscription" });
    expect(d.syncStatus).not.toHaveBeenCalled();
  });

  it("renews from the authorized_payment topic with the shaped invoice", async () => {
    const d = webhookDeps();
    const out = await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "77" }, d);
    expect(d.fetchAuthorizedPayment).toHaveBeenCalledWith("77");
    expect(d.renew).toHaveBeenCalledWith(SUB_ID, expect.objectContaining({ id: "77", payment_status: "approved", mp_payment_id: "900" }));
    expect(out).toEqual({ handled: true, result: "renewed", subscriptionId: SUB_ID });
  });

  it("resolves the subscription by preapproval when the charge carries no external_reference", async () => {
    const d = webhookDeps({
      fetchAuthorizedPayment: vi.fn(async () => ({ id: 78, preapproval_id: "pre-1", external_reference: null, status: "recycling", payment: null })),
    });
    await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "78" }, d);
    expect(d.findSubscriptionByPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.renew).toHaveBeenCalledWith("sub-1", expect.objectContaining({ payment_status: "pending" }));
  });

  it("ignores an unusable authorized_payment payload", async () => {
    const d = webhookDeps({ fetchAuthorizedPayment: vi.fn(async () => ({})) });
    expect(await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "9" }, d)).toEqual({ handled: false, reason: "invalid_payload" });
    expect(d.renew).not.toHaveBeenCalled();
  });

  it("reports when MP cannot be read", async () => {
    const d = webhookDeps({ fetchPreapproval: vi.fn(async () => null) });
    expect(await handleSubscriptionWebhook({ topic: "subscription_preapproval", id: "pre-1" }, d)).toEqual({ handled: false, reason: "provider_unavailable" });
    const d2 = webhookDeps({ fetchAuthorizedPayment: vi.fn(async () => null) });
    expect(await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "1" }, d2)).toEqual({ handled: false, reason: "provider_unavailable" });
  });

  it("ignores an authorized_payment whose subscription is unknown", async () => {
    const d = webhookDeps({
      fetchAuthorizedPayment: vi.fn(async () => ({ id: 1, preapproval_id: "pre-x", external_reference: null, status: "processed", payment: { status: "approved" } })),
      findSubscriptionByPreapproval: vi.fn(async () => null),
    });
    expect(await handleSubscriptionWebhook({ topic: "subscription_authorized_payment", id: "1" }, d)).toEqual({ handled: false, reason: "unknown_subscription" });
  });
});

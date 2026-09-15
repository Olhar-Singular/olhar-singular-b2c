import { describe, it, expect, vi } from "vitest";
import { runSubscribe, type SubscribeDeps, type SubscribeInput } from "./subscribeFlow";
import type { CardFormData } from "./mpCardPayment";

const PLAN = {
  id: "pl-pro", slug: "profissional", name: "Profissional", price_brl: "59.90", monthly_credits: 480,
  active: true, admin_only: false,
};
const BASIC = { id: "pl-basic", slug: "basico", name: "Básico", price_brl: "39.90", monthly_credits: 300, active: true, admin_only: false };
const ADMIN_PLAN = { ...PLAN, id: "pl-test", slug: "teste-admin", name: "Teste", price_brl: 1, monthly_credits: 1, admin_only: true };

const CARD: CardFormData = { token: "tok_1", payment_method_id: "master", issuer_id: "24", installments: 1 };

function input(overrides: Partial<SubscribeInput> = {}): SubscribeInput {
  return {
    userId: "u1",
    email: "account@test.com",
    planSlug: "profissional",
    card: CARD,
    cardLastFour: "1234",
    backUrl: "https://app.test/creditos",
    ...overrides,
  };
}

function deps(overrides: Partial<SubscribeDeps> = {}) {
  const d = {
    loadPlan: vi.fn(async (slug: string) => (slug === "profissional" ? PLAN : slug === "teste-admin" ? ADMIN_PLAN : null)),
    loadCheapestPublicPlan: vi.fn(async () => BASIC),
    loadProfile: vi.fn(async () => ({ access_kind: "legacy", is_super_admin: false })),
    findLiveSubscription: vi.fn(async () => null),
    expireStalePending: vi.fn(async () => undefined),
    insertSubscription: vi.fn(async () => "sub-1"),
    postPreapproval: vi.fn(async () => ({
      ok: true,
      status: 201,
      json: { id: "pre-1", status: "authorized", next_payment_date: "2026-10-12T12:00:00Z", payment_method_id: "master" },
    })),
    searchPreapprovalByRef: vi.fn(async () => null),
    activate: vi.fn(async () => ({ success: true })),
    cancelPreapproval: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    markPending: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
  return d as SubscribeDeps & typeof d;
}

describe("runSubscribe", () => {
  it("creates the subscription, posts the preapproval with the plan price and activates on authorized", async () => {
    const d = deps();
    const result = await runSubscribe(input(), d);

    expect(d.expireStalePending).toHaveBeenCalledWith("u1");
    expect(d.insertSubscription).toHaveBeenCalledWith({ userId: "u1", planId: "pl-pro", payerEmail: "account@test.com", attribution: undefined, trialEndsAt: null });
    const [body, idempotencyKey] = d.postPreapproval.mock.calls[0];
    expect(idempotencyKey).toBe("sub-1");
    expect(body).toMatchObject({
      external_reference: "sub-1",
      payer_email: "account@test.com",
      card_token_id: "tok_1",
      auto_recurring: { transaction_amount: 59.9, frequency: 1, frequency_type: "months", currency_id: "BRL" },
      status: "authorized",
      back_url: "https://app.test/creditos",
    });
    expect(d.activate).toHaveBeenCalledWith({
      subscriptionId: "sub-1",
      preapprovalId: "pre-1",
      mpStatus: "authorized",
      nextPaymentDate: "2026-10-12T12:00:00Z",
      cardBrand: "master",
      cardLastFour: "1234",
    });
    expect(result).toEqual({ ok: true, status: "authorized", subscriptionId: "sub-1", planSlug: "profissional", priceBrl: 59.9 });
  });

  it("leaves a pending preapproval for the webhook to activate", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => ({ ok: true, status: 201, json: { id: "pre-2", status: "pending" } })),
    });
    const result = await runSubscribe(input(), d);
    expect(d.markPending).toHaveBeenCalledWith({ subscriptionId: "sub-1", preapprovalId: "pre-2", mpStatus: "pending" });
    expect(d.activate).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, status: "pending", subscriptionId: "sub-1", planSlug: "profissional", priceBrl: 59.9 });
  });

  it("rejects the subscription when MP declines the card (2xx with another status)", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => ({ ok: true, status: 200, json: { id: "pre-3", status: "cancelled" } })),
    });
    const result = await runSubscribe(input(), d);
    expect(d.reject).toHaveBeenCalledWith({ subscriptionId: "sub-1", detail: "cancelled" });
    expect(result).toEqual({ ok: true, status: "rejected", subscriptionId: "sub-1", detail: "cancelled", planSlug: "profissional", priceBrl: 59.9 });
  });

  it("rejects the subscription on an HTTP error, keeping MP's message as detail", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => ({ ok: false, status: 400, json: { message: "Card token not found", status: 400 } })),
    });
    const result = await runSubscribe(input(), d);
    expect(d.reject).toHaveBeenCalledWith({ subscriptionId: "sub-1", detail: "Card token not found" });
    expect(result).toMatchObject({ ok: true, status: "rejected", detail: "Card token not found" });
  });

  // The POST is never retried blindly: a timeout could have created the preapproval.
  it("on a network failure looks the preapproval up by reference instead of posting again", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => { throw new TypeError("fetch failed"); }),
      searchPreapprovalByRef: vi.fn(async () => ({ id: "pre-9", status: "authorized", next_payment_date: null })),
    });
    const result = await runSubscribe(input(), d);
    expect(d.postPreapproval).toHaveBeenCalledTimes(1);
    expect(d.searchPreapprovalByRef).toHaveBeenCalledWith("sub-1");
    expect(d.activate).toHaveBeenCalledWith(expect.objectContaining({ preapprovalId: "pre-9" }));
    expect(result).toEqual({ ok: true, status: "authorized", subscriptionId: "sub-1", planSlug: "profissional", priceBrl: 59.9 });
  });

  it("rejects when the network failed and nothing was created at MP", async () => {
    const d = deps({ postPreapproval: vi.fn(async () => { throw new TypeError("fetch failed"); }) });
    const result = await runSubscribe(input(), d);
    expect(d.reject).toHaveBeenCalledWith({ subscriptionId: "sub-1", detail: "network_error" });
    expect(result).toMatchObject({ status: "rejected", detail: "network_error" });
  });

  it("refuses an unknown or inactive plan", async () => {
    const d = deps();
    expect(await runSubscribe(input({ planSlug: "nope" }), d)).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
    expect(d.insertSubscription).not.toHaveBeenCalled();

    const inactive = deps({ loadPlan: vi.fn(async () => ({ ...PLAN, active: false })) });
    expect(await runSubscribe(input(), inactive)).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
  });

  it("sells the admin-only smoke plan only to a super-admin", async () => {
    const regular = deps();
    expect(await runSubscribe(input({ planSlug: "teste-admin" }), regular)).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });

    const admin = deps({ loadProfile: vi.fn(async () => ({ access_kind: "exempt", is_super_admin: true })) });
    const result = await runSubscribe(input({ planSlug: "teste-admin" }), admin);
    expect(result).toMatchObject({ ok: true, status: "authorized" });
    expect(admin.postPreapproval.mock.calls[0][0]).toMatchObject({ auto_recurring: { transaction_amount: 1 } });
  });

  it("refuses a courtesy account (there is nothing to pay for)", async () => {
    const d = deps({ loadProfile: vi.fn(async () => ({ access_kind: "exempt", is_super_admin: false })) });
    expect(await runSubscribe(input(), d)).toEqual({ ok: false, error: "exempt_user", httpStatus: 409 });
  });

  it("refuses when the user already holds a live subscription", async () => {
    const d = deps({ findLiveSubscription: vi.fn(async () => ({ id: "sub-old", status: "authorized" })) });
    expect(await runSubscribe(input(), d)).toEqual({ ok: false, error: "already_subscribed", httpStatus: 409 });
    expect(d.insertSubscription).not.toHaveBeenCalled();
  });

  // A double click (or a card MP is still validating) must not open a second
  // preapproval: stale rows are expired first, a fresh pending one blocks.
  it("refuses a second attempt while a fresh pending one is in flight", async () => {
    const order: string[] = [];
    const d = deps({
      expireStalePending: vi.fn(async () => { order.push("expire"); }),
      findLiveSubscription: vi.fn(async () => { order.push("find"); return { id: "sub-p", status: "pending" }; }),
    });
    expect(await runSubscribe(input(), d)).toEqual({ ok: false, error: "attempt_in_progress", httpStatus: 409 });
    expect(order).toEqual(["expire", "find"]);
    expect(d.postPreapproval).not.toHaveBeenCalled();
  });

  it("cancels the preapproval at MP and rejects the row when activation is refused (race lost)", async () => {
    const d = deps({ activate: vi.fn(async () => ({ success: false, error: "duplicate_live_subscription" })) });
    const result = await runSubscribe(input(), d);
    expect(d.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.reject).toHaveBeenCalledWith({ subscriptionId: "sub-1", detail: "duplicate_live_subscription" });
    expect(result).toEqual({ ok: true, status: "rejected", subscriptionId: "sub-1", detail: "duplicate_live_subscription", planSlug: "profissional", priceBrl: 59.9 });
  });

  it("still rejects the row when the orphan preapproval cannot be cancelled, and logs it", async () => {
    const d = deps({
      activate: vi.fn(async () => ({ success: false })),
      cancelPreapproval: vi.fn(async () => { throw new Error("MP down"); }),
    });
    const result = await runSubscribe(input(), d);
    expect(result).toMatchObject({ status: "rejected", detail: "activation_failed" });
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/could not cancel/), "pre-1", expect.any(Error));
  });

  it("treats a null activation result as success (RPC returned no body)", async () => {
    const d = deps({ activate: vi.fn(async () => null) });
    expect(await runSubscribe(input(), d)).toMatchObject({ status: "authorized" });
  });

  it("refuses an unknown profile", async () => {
    const d = deps({ loadProfile: vi.fn(async () => null) });
    expect(await runSubscribe(input(), d)).toEqual({ ok: false, error: "profile_not_found", httpStatus: 404 });
  });

  it("sends a null last-four when the Brick did not report one", async () => {
    const d = deps();
    await runSubscribe(input({ cardLastFour: undefined }), d);
    expect(d.activate).toHaveBeenCalledWith(expect.objectContaining({ cardLastFour: null }));
  });

  it("passes the attribution through to the subscription row", async () => {
    const d = deps();
    await runSubscribe(input({ attribution: { utm_source: "meta" } }), d);
    expect(d.insertSubscription).toHaveBeenCalledWith(expect.objectContaining({ attribution: { utm_source: "meta" } }));
  });

  it("uses the price as a number even when PostgREST returns it as a string", async () => {
    const d = deps();
    await runSubscribe(input(), d);
    expect(d.postPreapproval.mock.calls[0][0]).toMatchObject({ auto_recurring: { transaction_amount: 59.9 } });
  });
});

describe("runSubscribe (trial with card)", () => {
  const NOW = new Date("2026-09-15T21:52:15.000Z");

  it("ignores planSlug, takes the cheapest public plan, stores trial_ends_at and schedules the first charge", async () => {
    const d = deps();
    const result = await runSubscribe(input({ planSlug: "profissional", trial: true, now: NOW }), d);

    expect(d.loadPlan).not.toHaveBeenCalled();
    expect(d.loadCheapestPublicPlan).toHaveBeenCalled();
    expect(d.insertSubscription).toHaveBeenCalledWith({
      userId: "u1", planId: "pl-basic", payerEmail: "account@test.com", attribution: undefined,
      trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
    const [body] = d.postPreapproval.mock.calls[0];
    expect(body).toMatchObject({
      reason: "Teste 7 dias + Básico - Olhar Singular",
      auto_recurring: { transaction_amount: 39.9, start_date: "2026-09-22T21:52:15.000Z" },
    });
    expect(d.activate).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub-1", preapprovalId: "pre-1" }));
    expect(result).toEqual({
      ok: true, status: "authorized", subscriptionId: "sub-1",
      planSlug: "basico", priceBrl: 39.9, trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
  });

  it("carries trialEndsAt on a pending trial too", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => ({ ok: true, status: 201, json: { id: "pre-2", status: "pending" } })),
    });
    const result = await runSubscribe(input({ trial: true, now: NOW }), d);
    expect(result).toEqual({
      ok: true, status: "pending", subscriptionId: "sub-1",
      planSlug: "basico", priceBrl: 39.9, trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
  });

  it("refuses the trial when no public plan is active", async () => {
    const d = deps({ loadCheapestPublicPlan: vi.fn(async () => null) });
    const result = await runSubscribe(input({ trial: true, now: NOW }), d);
    expect(result).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
    expect(d.insertSubscription).not.toHaveBeenCalled();
  });

  it("uses the wall clock when no clock is injected", async () => {
    const d = deps();
    const before = Date.now();
    const result = await runSubscribe(input({ trial: true }), d);
    const end = Date.parse((result as { trialEndsAt: string }).trialEndsAt);
    expect(end).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(end).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });
});

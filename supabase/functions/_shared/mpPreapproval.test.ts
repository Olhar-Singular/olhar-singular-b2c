import { describe, it, expect } from "vitest";
import {
  buildPreapprovalBody,
  interpretAuthorizedPayment,
  interpretPreapproval,
  parseSubscriptionNotification,
} from "./mpPreapproval";

const PLAN = { id: "pl-1", slug: "profissional", name: "Profissional", priceBrl: 59.9, monthlyCredits: 480, adminOnly: false };

describe("buildPreapprovalBody", () => {
  it("builds the monthly preapproval from the plan row, never from the request", () => {
    expect(
      buildPreapprovalBody({
        plan: PLAN,
        subscriptionId: "sub-1",
        payerEmail: "account@test.com",
        cardToken: "tok_1",
        backUrl: "https://app.test/creditos",
      }),
    ).toEqual({
      reason: "Assinatura Profissional - Olhar Singular",
      external_reference: "sub-1",
      payer_email: "account@test.com",
      card_token_id: "tok_1",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 59.9,
        currency_id: "BRL",
      },
      back_url: "https://app.test/creditos",
      status: "authorized",
    });
  });

  // statement_descriptor does not exist on /preapproval; the invoice name comes from the MP account.
  it("does not send a statement descriptor", () => {
    const body = buildPreapprovalBody({
      plan: PLAN, subscriptionId: "s", payerEmail: "a@b.c", cardToken: "t", backUrl: "https://x",
    });
    expect(body).not.toHaveProperty("statement_descriptor");
  });
});

describe("interpretPreapproval", () => {
  it("reads an authorized preapproval with its next charge and card brand", () => {
    expect(
      interpretPreapproval({
        id: "2c93808...",
        status: "authorized",
        next_payment_date: "2026-10-12T12:00:00.000-04:00",
        payment_method_id: "master",
      }),
    ).toEqual({
      status: "authorized",
      preapprovalId: "2c93808...",
      mpStatus: "authorized",
      nextPaymentDate: "2026-10-12T12:00:00.000-04:00",
      cardBrand: "master",
      statusDetail: null,
    });
  });

  it("reads a pending preapproval (card still being validated)", () => {
    expect(interpretPreapproval({ id: "p", status: "pending" })).toMatchObject({
      status: "pending",
      preapprovalId: "p",
      nextPaymentDate: null,
      cardBrand: null,
    });
  });

  it("treats any other status as rejected, keeping the detail", () => {
    expect(interpretPreapproval({ id: "p", status: "cancelled", reason: "x" })).toMatchObject({
      status: "rejected",
      statusDetail: "cancelled",
    });
  });

  it("treats a payload without id as rejected", () => {
    expect(interpretPreapproval({ status: "authorized" })).toMatchObject({ status: "rejected", preapprovalId: null });
    expect(interpretPreapproval({})).toMatchObject({ status: "rejected", statusDetail: "unknown" });
    expect(interpretPreapproval({ message: "invalid card", status: 400 })).toMatchObject({
      status: "rejected",
      statusDetail: "invalid card",
    });
  });
});

describe("parseSubscriptionNotification", () => {
  it("routes the three topics we handle", () => {
    expect(parseSubscriptionNotification({ type: "payment", data: { id: 1 } }, null)).toEqual({ topic: "payment", id: "1" });
    expect(parseSubscriptionNotification({ type: "subscription_preapproval", data: { id: "pre" } }, null)).toEqual({
      topic: "subscription_preapproval",
      id: "pre",
    });
    expect(parseSubscriptionNotification({ type: "subscription_authorized_payment", data: { id: 77 } }, null)).toEqual({
      topic: "subscription_authorized_payment",
      id: "77",
    });
  });

  it("falls back to the data.id query param for the id", () => {
    expect(parseSubscriptionNotification({ type: "payment" }, "55")).toEqual({ topic: "payment", id: "55" });
  });

  it("ignores unknown topics and missing ids", () => {
    expect(parseSubscriptionNotification({ type: "merchant_order", data: { id: 1 } }, null)).toEqual({ topic: null, id: null });
    expect(parseSubscriptionNotification({ type: "payment" }, null)).toEqual({ topic: null, id: null });
    expect(parseSubscriptionNotification(null, "9")).toEqual({ topic: null, id: null });
  });
});

describe("interpretAuthorizedPayment", () => {
  const ap = {
    id: 123,
    preapproval_id: "pre-1",
    external_reference: "sub-1",
    status: "processed",
    debit_date: "2026-10-12T12:00:00.000-04:00",
    retry_attempt: 1,
    transaction_amount: 59.9,
    payment: { id: 999, status: "approved", status_detail: "accredited" },
  };

  it("shapes the invoice for renew_subscription, keeping only an approved payment as paid", () => {
    expect(interpretAuthorizedPayment(ap)).toEqual({
      subscriptionId: "sub-1",
      preapprovalId: "pre-1",
      invoice: {
        id: "123",
        mp_payment_id: "999",
        status: "processed",
        payment_status: "approved",
        amount_brl: 59.9,
        debit_date: "2026-10-12T12:00:00.000-04:00",
        retry_attempt: 1,
        raw: { id: 123, status: "processed", payment_status: "approved", status_detail: "accredited" },
      },
    });
  });

  // "processed" only says MP is done trying; the money is in payment.status.
  it("marks a processed charge whose payment was rejected as rejected", () => {
    const out = interpretAuthorizedPayment({ ...ap, payment: { id: 1, status: "rejected", status_detail: "cc_rejected_other_reason" } });
    expect(out?.invoice.payment_status).toBe("rejected");
  });

  it("marks recycling with no payment as pending (not paid)", () => {
    const out = interpretAuthorizedPayment({ ...ap, status: "recycling", payment: undefined, transaction_amount: undefined, debit_date: undefined, retry_attempt: undefined });
    expect(out?.invoice.payment_status).toBe("pending");
    expect(out?.invoice.mp_payment_id).toBeNull();
    expect(out?.invoice).toMatchObject({ amount_brl: null, debit_date: null, retry_attempt: null, status: "recycling" });
    expect(interpretAuthorizedPayment({ id: 1, preapproval_id: "pre-1" })?.invoice.status).toBeNull();
  });

  it("returns null without an authorized_payment id or a subscription reference", () => {
    expect(interpretAuthorizedPayment({ ...ap, id: undefined })).toBeNull();
    expect(interpretAuthorizedPayment({ ...ap, external_reference: null, preapproval_id: null })).toBeNull();
  });

  it("keeps the preapproval id when the external reference is missing, so the webhook can look it up", () => {
    expect(interpretAuthorizedPayment({ ...ap, external_reference: null })).toMatchObject({
      subscriptionId: null,
      preapprovalId: "pre-1",
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  CARD_STATEMENT_DESCRIPTOR,
  buildCardPaymentBody,
  interpretCardPayment,
  maskPayer,
  parseCardFormData,
  type CardFormData,
} from "./mpCardPayment";

const PKG = { id: "pkg-pro", credits: 120, amountBrl: 29.9, label: "Profissional", adminOnly: false };

const CARD: CardFormData = {
  token: "tok_123",
  payment_method_id: "master",
  issuer_id: "24",
  installments: 1,
  payer: { email: "buyer@test.com", identification: { type: "CPF", number: "12345678909" } },
};

describe("parseCardFormData", () => {
  it("accepts the Card Payment Brick formData", () => {
    expect(parseCardFormData(CARD)).toEqual({ ok: true, card: CARD });
  });

  it("turns a numeric issuer_id into a string", () => {
    const parsed = parseCardFormData({ ...CARD, issuer_id: 24 });
    expect(parsed).toEqual({ ok: true, card: { ...CARD, issuer_id: "24" } });
  });

  it("accepts a card without issuer_id, installments or identification", () => {
    const minimal = { token: "tok", payment_method_id: "visa", payer: { email: "a@b.c" } };
    expect(parseCardFormData(minimal)).toEqual({ ok: true, card: minimal });
  });

  it("rejects a non-object body", () => {
    expect(parseCardFormData(null)).toEqual({ ok: false, error: "invalid_card" });
    expect(parseCardFormData("tok")).toEqual({ ok: false, error: "invalid_card" });
  });

  it("rejects a missing or empty token", () => {
    expect(parseCardFormData({ ...CARD, token: "" })).toEqual({ ok: false, error: "invalid_card" });
    expect(parseCardFormData({ ...CARD, token: undefined })).toEqual({ ok: false, error: "invalid_card" });
  });

  it("rejects a missing payment_method_id", () => {
    expect(parseCardFormData({ ...CARD, payment_method_id: 7 })).toEqual({ ok: false, error: "invalid_card" });
  });

  // Decision 22: no instalments. A Brick configured otherwise must not slip through.
  it("rejects any instalment count other than 1", () => {
    expect(parseCardFormData({ ...CARD, installments: 3 })).toEqual({ ok: false, error: "installments_not_allowed" });
  });

  it("ignores a payer that is not an object", () => {
    const parsed = parseCardFormData({ token: "tok", payment_method_id: "visa", payer: "buyer@test.com" });
    expect(parsed).toEqual({ ok: true, card: { token: "tok", payment_method_id: "visa" } });
  });

  it("keeps the identification when the payer has no e-mail", () => {
    const parsed = parseCardFormData({
      token: "tok",
      payment_method_id: "visa",
      payer: { identification: { type: "CPF", number: "12345678909" } },
    });
    expect(parsed).toEqual({
      ok: true,
      card: { token: "tok", payment_method_id: "visa", payer: { identification: { type: "CPF", number: "12345678909" } } },
    });
  });

  it("drops a malformed identification instead of forwarding it", () => {
    const parsed = parseCardFormData({ ...CARD, payer: { email: "a@b.c", identification: { type: "CPF" } } });
    expect(parsed).toEqual({ ok: true, card: { ...CARD, payer: { email: "a@b.c" } } });
  });
});

describe("buildCardPaymentBody", () => {
  const input = {
    pkg: PKG,
    purchaseId: "purchase-1",
    card: CARD,
    email: "account@test.com",
    notificationUrl: "https://x.supabase.co/functions/v1/mp-webhook",
  };

  it("builds the /v1/payments body from the package row, never from the request amount", () => {
    expect(buildCardPaymentBody(input)).toEqual({
      transaction_amount: 29.9,
      token: "tok_123",
      description: "120 créditos - Olhar Singular",
      installments: 1,
      payment_method_id: "master",
      issuer_id: "24",
      payer: { email: "account@test.com", identification: { type: "CPF", number: "12345678909" } },
      external_reference: "purchase-1",
      notification_url: "https://x.supabase.co/functions/v1/mp-webhook",
      statement_descriptor: CARD_STATEMENT_DESCRIPTOR,
      binary_mode: true,
      metadata: { purchase_id: "purchase-1" },
    });
  });

  it("prints the statement descriptor the owner chose", () => {
    expect(CARD_STATEMENT_DESCRIPTOR).toBe("OLHAR SINGULAR");
    expect(CARD_STATEMENT_DESCRIPTOR.length).toBeLessThanOrEqual(22);
  });

  it("uses the account e-mail as payer, not the one typed in the Brick", () => {
    const body = buildCardPaymentBody(input) as { payer: { email: string } };
    expect(body.payer.email).toBe("account@test.com");
  });

  it("omits issuer_id and identification when the card has none", () => {
    const body = buildCardPaymentBody({
      ...input,
      card: { token: "tok", payment_method_id: "visa" },
    });
    expect(body).not.toHaveProperty("issuer_id");
    expect(body.payer).toEqual({ email: "account@test.com" });
  });

  it("uses the singular for a one-credit package", () => {
    const body = buildCardPaymentBody({ ...input, pkg: { ...PKG, credits: 1, amountBrl: 1 } });
    expect(body.description).toBe("1 crédito - Olhar Singular");
  });
});

describe("interpretCardPayment", () => {
  it("reads an approved payment", () => {
    expect(interpretCardPayment({ id: 123, status: "approved", status_detail: "accredited" })).toEqual({
      status: "approved",
      paymentId: "123",
    });
  });

  it("reads a rejected payment with its detail", () => {
    expect(
      interpretCardPayment({ id: "456", status: "rejected", status_detail: "cc_rejected_insufficient_amount" }),
    ).toEqual({ status: "rejected", paymentId: "456", statusDetail: "cc_rejected_insufficient_amount" });
  });

  it("falls back to a generic detail when MP sends none on a rejection", () => {
    expect(interpretCardPayment({ id: 1, status: "rejected" })).toEqual({
      status: "rejected",
      paymentId: "1",
      statusDetail: "unknown",
    });
  });

  it("treats cancelled like rejected", () => {
    expect(interpretCardPayment({ id: 1, status: "cancelled", status_detail: "expired" }).status).toBe("rejected");
  });

  it("leaves anything else pending for the webhook to settle", () => {
    expect(interpretCardPayment({ id: 9, status: "in_process", status_detail: "pending_review_manual" })).toEqual({
      status: "pending",
      paymentId: "9",
      statusDetail: "pending_review_manual",
    });
    expect(interpretCardPayment({})).toEqual({ status: "pending", paymentId: null, statusDetail: null });
  });
});

describe("maskPayer", () => {
  it("redacts the card token and the payer block for logging", () => {
    const body = buildCardPaymentBody({
      pkg: PKG,
      purchaseId: "p",
      card: CARD,
      email: "a@b.c",
      notificationUrl: "https://n",
    });
    const masked = maskPayer(body);
    expect(masked.token).toBe("[redacted]");
    expect(masked.payer).toBe("[redacted]");
    expect(masked.transaction_amount).toBe(29.9);
  });

  it("does not mutate the original object", () => {
    const original = { token: "t", payer: { email: "e" }, other: 1 };
    const masked = maskPayer(original);
    expect(original.token).toBe("t");
    expect(masked).not.toBe(original);
  });

  it("leaves objects without those keys untouched", () => {
    expect(maskPayer({ message: "boom" })).toEqual({ message: "boom" });
  });
});

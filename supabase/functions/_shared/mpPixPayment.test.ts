import { describe, it, expect } from "vitest";
import {
  buildPixPaymentBody,
  extractPixQr,
  PIX_EXPIRES_AFTER_SECONDS,
} from "./mpPixPayment";

const BASE = {
  pkg: { credits: 30, amountBrl: 9.9 },
  purchaseId: "purchase-1",
  email: "buyer@test.com",
  notificationUrl: "https://fn.test/mp-webhook",
  now: new Date("2026-08-16T12:00:00.000Z"),
} as const;

describe("buildPixPaymentBody", () => {
  it("charges the package price in reais, not cents", () => {
    const body = buildPixPaymentBody({ ...BASE });
    expect(body.transaction_amount).toBe(9.9);
  });

  it("asks for Pix and ties the payment to the purchase row", () => {
    const body = buildPixPaymentBody({ ...BASE });

    expect(body).toMatchObject({
      payment_method_id: "pix",
      external_reference: "purchase-1",
      notification_url: "https://fn.test/mp-webhook",
      payer: { email: "buyer@test.com" },
    });
  });

  it("describes the purchase with a regular hyphen, never an em dash", () => {
    const body = buildPixPaymentBody({ ...BASE });
    expect(body.description).toBe("30 créditos - Olhar Singular");
  });

  it("labels a single-credit package in the singular", () => {
    const body = buildPixPaymentBody({ ...BASE, pkg: { credits: 1, amountBrl: 1 } });
    expect(body.description).toBe("1 crédito - Olhar Singular");
  });

  it("omits payer when the account has no email", () => {
    const body = buildPixPaymentBody({ ...BASE, email: undefined });
    expect(body).not.toHaveProperty("payer");
  });

  // MP documents date_of_expiration as yyyy-MM-ddTHH:mm:ss.SSS±hh:mm; a bare "Z"
  // is rejected, so the offset form is what goes on the wire.
  it("expires the QR at now + expiresInSeconds, with an explicit UTC offset", () => {
    const body = buildPixPaymentBody({ ...BASE, expiresInSeconds: 3600 });
    expect(body.date_of_expiration).toBe("2026-08-16T10:00:00.000-03:00");
  });

  it("defaults the QR lifetime to one hour", () => {
    expect(PIX_EXPIRES_AFTER_SECONDS).toBe(3600);
    const body = buildPixPaymentBody({ ...BASE });
    expect(body.date_of_expiration).toBe("2026-08-16T10:00:00.000-03:00");
  });

  it("expires relative to the current clock when no reference time is given", () => {
    const before = Date.now();
    const body = buildPixPaymentBody({
      pkg: BASE.pkg,
      purchaseId: BASE.purchaseId,
      notificationUrl: BASE.notificationUrl,
    });
    const expiresAt = new Date(body.date_of_expiration as string).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + PIX_EXPIRES_AFTER_SECONDS * 1000);
  });
});

// Shape returned by a real POST /v1/payments with payment_method_id "pix".
const PENDING_PAYMENT = {
  id: 123456789,
  status: "pending",
  point_of_interaction: {
    transaction_data: {
      qr_code: "00020126580014br.gov.bcb.pix0136abc",
      qr_code_base64: "iVBORw0KGgo=",
      ticket_url: "https://mp.test/ticket/123",
    },
  },
};

describe("extractPixQr", () => {
  it("returns the copy-and-paste code and the QR image of a pending payment", () => {
    expect(extractPixQr(PENDING_PAYMENT)).toEqual({
      paymentId: "123456789",
      status: "pending",
      qrCode: "00020126580014br.gov.bcb.pix0136abc",
      qrCodeBase64: "iVBORw0KGgo=",
      ticketUrl: "https://mp.test/ticket/123",
    });
  });

  it("leaves ticketUrl undefined when MP does not send one", () => {
    const payment = {
      ...PENDING_PAYMENT,
      point_of_interaction: {
        transaction_data: {
          qr_code: "00020126580014br.gov.bcb.pix0136abc",
          qr_code_base64: "iVBORw0KGgo=",
        },
      },
    };
    expect(extractPixQr(payment)?.ticketUrl).toBeUndefined();
  });

  // The copy-and-paste code is what actually pays; a missing image only costs
  // the convenience of scanning, so it must not blank out the whole flow.
  it("keeps the code usable when the QR image is missing", () => {
    const payment = {
      ...PENDING_PAYMENT,
      point_of_interaction: { transaction_data: { qr_code: "00020126580014br.gov.bcb.pix0136abc" } },
    };
    expect(extractPixQr(payment)?.qrCodeBase64).toBe("");
  });

  it("treats a payment with no status as still pending", () => {
    const { status, ...rest } = PENDING_PAYMENT;
    expect(extractPixQr(rest)?.status).toBe("pending");
  });

  it("returns null when the payment carries no point_of_interaction", () => {
    expect(extractPixQr({ id: 1, status: "pending" })).toBeNull();
  });

  it("returns null when transaction_data is missing", () => {
    expect(extractPixQr({ id: 1, status: "pending", point_of_interaction: {} })).toBeNull();
  });

  it("returns null when there is no copy-and-paste code to show", () => {
    const payment = {
      id: 1,
      status: "pending",
      point_of_interaction: { transaction_data: { qr_code: "", qr_code_base64: "iVBOR" } },
    };
    expect(extractPixQr(payment)).toBeNull();
  });

  it("returns null when the payment has no id to reconcile against", () => {
    expect(extractPixQr({ ...PENDING_PAYMENT, id: undefined })).toBeNull();
  });
});

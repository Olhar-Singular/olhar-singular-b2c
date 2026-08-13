import { describe, it, expect } from "vitest";
import {
  parsePaymentNotification,
  extractApprovedGrant,
  extractRejectedPurchase,
} from "./mpEvents";

describe("parsePaymentNotification", () => {
  it("returns the payment id for a payment notification", () => {
    expect(parsePaymentNotification({ type: "payment", data: { id: "123" } })).toBe("123");
  });

  it("stringifies a numeric id (MP sends it either way)", () => {
    expect(parsePaymentNotification({ type: "payment", data: { id: 123 } })).toBe("123");
  });

  it("ignores non-payment notifications (e.g. merchant_order)", () => {
    expect(parsePaymentNotification({ type: "merchant_order", data: { id: "1" } })).toBeNull();
  });

  it("returns null when there is no data id", () => {
    expect(parsePaymentNotification({ type: "payment", data: {} })).toBeNull();
    expect(parsePaymentNotification({ type: "payment", data: null })).toBeNull();
    expect(parsePaymentNotification({ type: "payment" })).toBeNull();
  });

  it("returns null when the id is an empty string", () => {
    expect(parsePaymentNotification({ type: "payment", data: { id: "" } })).toBeNull();
  });
});

describe("extractApprovedGrant", () => {
  it("returns the purchase id for an approved payment", () => {
    expect(
      extractApprovedGrant({ status: "approved", external_reference: "purchase-1" }),
    ).toEqual({ purchaseId: "purchase-1" });
  });

  it("returns null while the Pix is still pending", () => {
    expect(
      extractApprovedGrant({ status: "pending", external_reference: "purchase-1" }),
    ).toBeNull();
  });

  it("returns null when an approved payment carries no external_reference", () => {
    expect(extractApprovedGrant({ status: "approved" })).toBeNull();
    expect(extractApprovedGrant({ status: "approved", external_reference: null })).toBeNull();
  });
});

describe("extractRejectedPurchase", () => {
  it("closes out a rejected payment", () => {
    expect(
      extractRejectedPurchase({ status: "rejected", external_reference: "purchase-1" }),
    ).toEqual({ purchaseId: "purchase-1" });
  });

  it("closes out a cancelled payment (expired Pix)", () => {
    expect(
      extractRejectedPurchase({ status: "cancelled", external_reference: "purchase-1" }),
    ).toEqual({ purchaseId: "purchase-1" });
  });

  it("does not treat approved or pending as a failure", () => {
    expect(extractRejectedPurchase({ status: "approved", external_reference: "p1" })).toBeNull();
    expect(extractRejectedPurchase({ status: "pending", external_reference: "p1" })).toBeNull();
  });

  it("returns null when a failed payment carries no external_reference", () => {
    expect(extractRejectedPurchase({ status: "rejected" })).toBeNull();
  });

  it("returns null when the payment has no status at all", () => {
    expect(extractRejectedPurchase({ external_reference: "p1" })).toBeNull();
  });
});

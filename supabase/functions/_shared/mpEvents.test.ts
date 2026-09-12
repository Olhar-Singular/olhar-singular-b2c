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
      extractApprovedGrant({ status: "approved", external_reference: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" }),
    ).toEqual({ purchaseId: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" });
  });

  it("returns null while the Pix is still pending", () => {
    expect(
      extractApprovedGrant({ status: "pending", external_reference: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" }),
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
      extractRejectedPurchase({ status: "rejected", external_reference: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" }),
    ).toEqual({ purchaseId: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" });
  });

  it("closes out a cancelled payment (expired Pix)", () => {
    expect(
      extractRejectedPurchase({ status: "cancelled", external_reference: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" }),
    ).toEqual({ purchaseId: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" });
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

describe("external_reference must be a credit_purchases uuid", () => {
  it("ignores approved payments whose reference is not a uuid (other products, manual tests)", () => {
    expect(extractApprovedGrant({ status: "approved", external_reference: "ext_ref_1234" })).toBeNull();
    expect(extractRejectedPurchase({ status: "rejected", external_reference: "ORDER-77" })).toBeNull();
  });

  it("normalizes the uuid to lower case", () => {
    expect(
      extractApprovedGrant({ status: "approved", external_reference: "6F1D2C3B-4A5E-4F60-8B7C-9D0E1F2A3B4C" }),
    ).toEqual({ purchaseId: "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c" });
  });
});

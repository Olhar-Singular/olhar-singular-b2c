import { describe, it, expect } from "vitest";
import { parseCardPaymentRequest } from "./cardPaymentInput";

const CARD = { token: "tok", payment_method_id: "visa", payer: { email: "a@b.c" } };

describe("parseCardPaymentRequest", () => {
  it("accepts a package id and a valid Brick payload", () => {
    expect(parseCardPaymentRequest({ packageId: "pkg-1", card: CARD })).toEqual({
      ok: true,
      packageId: "pkg-1",
      card: CARD,
    });
  });

  it("rejects a non-object body", () => {
    expect(parseCardPaymentRequest(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(parseCardPaymentRequest("x")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing or non-string package id", () => {
    expect(parseCardPaymentRequest({ card: CARD })).toEqual({ ok: false, error: "invalid_package" });
    expect(parseCardPaymentRequest({ packageId: 7, card: CARD })).toEqual({ ok: false, error: "invalid_package" });
    expect(parseCardPaymentRequest({ packageId: "", card: CARD })).toEqual({ ok: false, error: "invalid_package" });
  });

  it("surfaces the card parser's error", () => {
    expect(parseCardPaymentRequest({ packageId: "pkg-1", card: { token: "" } })).toEqual({
      ok: false,
      error: "invalid_card",
    });
    expect(parseCardPaymentRequest({ packageId: "pkg-1", card: { ...CARD, installments: 6 } })).toEqual({
      ok: false,
      error: "installments_not_allowed",
    });
  });
});

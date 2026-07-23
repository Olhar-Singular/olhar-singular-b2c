import { describe, it, expect } from "vitest";
import {
  PIX_EXPIRES_AFTER_SECONDS,
  parseCheckoutMethod,
  buildCheckoutSessionParams,
} from "./stripeCheckoutParams";

const BASE = {
  pkg: { credits: 30, amountBrl: 9.9 },
  purchaseId: "purchase-1",
  userId: "user-1",
  email: "buyer@test.com",
  appUrl: "https://app.test",
} as const;

describe("parseCheckoutMethod", () => {
  it("defaults to card when the client sends no method", () => {
    expect(parseCheckoutMethod(undefined)).toBe("card");
  });

  it("defaults to card when the method is null", () => {
    expect(parseCheckoutMethod(null)).toBe("card");
  });

  it("accepts card", () => {
    expect(parseCheckoutMethod("card")).toBe("card");
  });

  it("accepts pix", () => {
    expect(parseCheckoutMethod("pix")).toBe("pix");
  });

  it("rejects a payment method the checkout does not support", () => {
    expect(parseCheckoutMethod("boleto")).toBeNull();
  });

  it("rejects a non-string method", () => {
    expect(parseCheckoutMethod(42)).toBeNull();
  });
});

describe("buildCheckoutSessionParams", () => {
  it("builds a card session with the package price in cents", () => {
    const params = buildCheckoutSessionParams({ ...BASE, method: "card" });

    expect(params).toMatchObject({
      mode: "payment",
      payment_method_types: ["card"],
      client_reference_id: "purchase-1",
      customer_email: "buyer@test.com",
      success_url: "https://app.test/creditos/sucesso",
      cancel_url: "https://app.test/creditos",
      metadata: { purchase_id: "purchase-1", user_id: "user-1", credits: "30" },
    });
    expect(params.line_items).toEqual([
      {
        price_data: {
          currency: "brl",
          product_data: { name: "30 créditos — Olhar Singular" },
          unit_amount: 990,
        },
        quantity: 1,
      },
    ]);
  });

  it("does not set Pix options on a card session", () => {
    const params = buildCheckoutSessionParams({ ...BASE, method: "card" });
    expect(params.payment_method_options).toBeUndefined();
  });

  it("builds a Pix session with a one-hour QR code expiry", () => {
    const params = buildCheckoutSessionParams({ ...BASE, method: "pix" });

    expect(params.payment_method_types).toEqual(["pix"]);
    expect(params.payment_method_options).toEqual({
      pix: { expires_after_seconds: PIX_EXPIRES_AFTER_SECONDS },
    });
    expect(PIX_EXPIRES_AFTER_SECONDS).toBe(3600);
  });

  // Pix credits only after the async webhook lands, so the success page needs to
  // know which method brought the user there before promising a balance.
  it("marks the success url so the Pix landing copy can differ", () => {
    const params = buildCheckoutSessionParams({ ...BASE, method: "pix" });
    expect(params.success_url).toBe("https://app.test/creditos/sucesso?metodo=pix");
  });

  it("omits customer_email when the account has none", () => {
    const params = buildCheckoutSessionParams({ ...BASE, email: undefined, method: "card" });
    expect(params).not.toHaveProperty("customer_email");
  });

  it("rounds sub-cent package prices instead of truncating", () => {
    const params = buildCheckoutSessionParams({
      ...BASE,
      pkg: { credits: 300, amountBrl: 59.9 },
      method: "card",
    });
    expect((params.line_items as [{ price_data: { unit_amount: number } }])[0].price_data
      .unit_amount).toBe(5990);
  });

  it("labels a single-credit package in the singular", () => {
    const params = buildCheckoutSessionParams({
      ...BASE,
      pkg: { credits: 1, amountBrl: 1 },
      method: "pix",
    });
    expect((params.line_items as [{ price_data: { product_data: { name: string } } }])[0]
      .price_data.product_data.name).toBe("1 crédito — Olhar Singular");
  });
});

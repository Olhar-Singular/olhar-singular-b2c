import { describe, it, expect } from "vitest";
import { buildMpPreference } from "./mpCheckout";

const BASE = {
  pkg: { credits: 30, amountBrl: 9.9 },
  purchaseId: "purchase-1",
  email: "buyer@test.com",
  appUrl: "https://app.test",
  notificationUrl: "https://fn.test/mp-webhook",
} as const;

describe("buildMpPreference", () => {
  it("builds a Pix-only preference tied to the purchase", () => {
    const pref = buildMpPreference({ ...BASE });

    expect(pref).toMatchObject({
      external_reference: "purchase-1",
      notification_url: "https://fn.test/mp-webhook",
      payer: { email: "buyer@test.com" },
    });
    expect(pref.items).toEqual([
      {
        title: "30 créditos - Olhar Singular",
        quantity: 1,
        unit_price: 9.9,
        currency_id: "BRL",
      },
    ]);
  });

  it("excludes every card/boleto type so only Pix is offered", () => {
    const pref = buildMpPreference({ ...BASE }) as {
      payment_methods: { excluded_payment_types: { id: string }[]; installments: number };
    };
    const excluded = pref.payment_methods.excluded_payment_types.map((t) => t.id);
    expect(excluded).toEqual(
      expect.arrayContaining(["credit_card", "debit_card", "ticket", "atm", "prepaid_card"]),
    );
    expect(pref.payment_methods.installments).toBe(1);
  });

  it("marks the success url as Pix so the landing copy waits for settlement", () => {
    const pref = buildMpPreference({ ...BASE }) as { back_urls: { success: string; failure: string } };
    expect(pref.back_urls.success).toBe("https://app.test/creditos/sucesso?metodo=pix");
    expect(pref.back_urls.failure).toBe("https://app.test/creditos");
  });

  it("omits payer when the account has no email", () => {
    const pref = buildMpPreference({ ...BASE, email: undefined });
    expect(pref).not.toHaveProperty("payer");
  });

  // MP rejects auto_return with a localhost success url ("back_url.success must
  // be defined"), so it is only set for a real HTTPS domain. Crediting happens
  // via the webhook regardless, so this only affects the auto-redirect back.
  it("sets auto_return only for an HTTPS app url", () => {
    expect(buildMpPreference({ ...BASE, appUrl: "https://app.test" }).auto_return).toBe("approved");
  });

  it("omits auto_return for a localhost app url so the preference is accepted", () => {
    const pref = buildMpPreference({ ...BASE, appUrl: "http://localhost:8080" });
    expect(pref).not.toHaveProperty("auto_return");
    expect((pref.back_urls as { success: string }).success).toBe(
      "http://localhost:8080/creditos/sucesso?metodo=pix",
    );
  });

  it("labels a single-credit package in the singular", () => {
    const pref = buildMpPreference({ ...BASE, pkg: { credits: 1, amountBrl: 1 } }) as {
      items: [{ title: string }];
    };
    expect(pref.items[0].title).toBe("1 crédito - Olhar Singular");
  });
});

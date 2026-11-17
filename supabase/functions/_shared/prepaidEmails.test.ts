import { describe, it, expect, vi } from "vitest";
import { buildPrepaidConfirmationEmail, sendPrepaidConfirmation, type PrepaidConfirmationInput } from "./prepaidEmails";

const BASE: PrepaidConfirmationInput = {
  fullName: "Ana Souza",
  months: 3,
  credits: 900,
  creditsNow: 300,
  creditsLocked: 600,
  unlockAt: new Date("2026-11-22T15:00:00.000Z"),
  periodEnd: new Date("2027-02-15T15:00:00.000Z"),
  amountBrl: 89.9,
  paidAt: new Date("2026-11-15T15:00:00.000Z"),
  termsVersion: "2026-11.1",
  appUrl: "https://professor.olharsingular.com",
};

describe("buildPrepaidConfirmationEmail", () => {
  it("states what was bought, the price, the validity and the two-part release", () => {
    const { subject, text, html } = buildPrepaidConfirmationEmail(BASE);
    expect(subject).toBe("Seu plano à vista de 3 meses está confirmado");
    expect(text).toContain("Olá, Ana!");
    expect(text).toContain("Plano: à vista, 3 meses");
    expect(text).toContain("Valor pago: R$ 89,90 (pagamento único, no Pix)");
    expect(text).toContain("Créditos: 900 no total");
    expect(text).toContain("Acesso até 15/02/2027.");
    expect(text).toContain("300 créditos já estão na sua conta; os outros 600 entram em 22/11/2026, depois do prazo de garantia.");
    expect(text).toContain("Nada é cobrado de novo sem você pedir.");
    expect(text).toContain("Versão dos Termos de Uso aceita: 2026-11.1");
    expect(text).toContain("https://professor.olharsingular.com/reembolso");
    expect(html).toContain("Valor pago");
  });

  it("states the 7-day guarantee with the deadline", () => {
    const { text } = buildPrepaidConfirmationEmail(BASE);
    expect(text).toContain("Garantia de 7 dias: se não servir para a sua realidade de sala, peça até 22/11/2026 pelo suporte e devolvemos o valor integral.");
  });

  it("says everything is in the account when nothing is locked (1 month)", () => {
    const { subject, text } = buildPrepaidConfirmationEmail({ ...BASE, months: 1, credits: 300, creditsNow: 300, creditsLocked: 0, unlockAt: null });
    expect(subject).toBe("Seu plano à vista de 1 mês está confirmado");
    expect(text).toContain("Os 300 créditos já estão na sua conta.");
    expect(text).not.toContain("entram em");
  });

  it("omits the terms line for a logged-in buyer who did not re-accept", () => {
    expect(buildPrepaidConfirmationEmail({ ...BASE, termsVersion: null }).text).not.toContain("Versão dos Termos");
  });

  it("greets without a name and escapes the HTML", () => {
    expect(buildPrepaidConfirmationEmail({ ...BASE, fullName: null }).text).toContain("Olá!");
    const { html } = buildPrepaidConfirmationEmail({ ...BASE, fullName: "<b>Ana</b>" });
    expect(html).toContain("Olá, &lt;b&gt;Ana&lt;/b&gt;!");
    expect(html).not.toContain("<b>Ana</b>");
  });

  it("never uses an em dash", () => {
    for (const input of [BASE, { ...BASE, months: 1, creditsLocked: 0, unlockAt: null }]) {
      const { subject, text, html } = buildPrepaidConfirmationEmail(input);
      expect(subject + text + html).not.toContain("—");
    }
  });

  it("fails loudly when a locked part has no unlock date", () => {
    expect(() => buildPrepaidConfirmationEmail({ ...BASE, unlockAt: null })).toThrow(/unlockAt/);
  });
});

describe("sendPrepaidConfirmation", () => {
  it("sends the built e-mail to the buyer with its tag", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em-1" }), { status: 200 }));
    const result = await sendPrepaidConfirmation(
      { fetch: fetchMock as unknown as typeof fetch, config: { apiKey: "k", from: "X <x@y.com>" }, log: vi.fn(), info: vi.fn() },
      { ...BASE, to: "ana@example.com" },
    );
    expect(result).toEqual({ ok: true, id: "em-1" });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(["ana@example.com"]);
    expect(body.subject).toBe("Seu plano à vista de 3 meses está confirmado");
    expect(body.tags).toEqual([{ name: "type", value: "prepaid_confirmation" }]);
  });
});

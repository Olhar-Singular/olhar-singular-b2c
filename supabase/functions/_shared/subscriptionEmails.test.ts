import { describe, it, expect, vi } from "vitest";
import { dispatchInBackground } from "./background";
import { TRIAL_DAYS } from "./mpPreapproval";
import {
  buildSubscriptionConfirmationEmail,
  formatBrl,
  formatDateBr,
  sendSubscriptionConfirmation,
  type SubscriptionConfirmationInput,
} from "./subscriptionEmails";

const CHARGED_AT = new Date("2026-10-13T23:30:00Z"); // 13/10 20:30 in São Paulo
const TRIAL_ENDS_AT = new Date("2026-10-21T02:30:00Z"); // still 20/10 in São Paulo (UTC-3)

function trial(overrides: Partial<SubscriptionConfirmationInput> = {}): SubscriptionConfirmationInput {
  return {
    fullName: "Professora Exemplo",
    planName: "Básico",
    priceBrl: 39.9,
    monthlyCredits: 300,
    trial: true,
    trialEndsAt: TRIAL_ENDS_AT,
    chargedAt: CHARGED_AT,
    termsVersion: "2026-10.1",
    appUrl: "https://professor.olharsingular.com",
    ...overrides,
  };
}

function paid(overrides: Partial<SubscriptionConfirmationInput> = {}): SubscriptionConfirmationInput {
  return trial({ planName: "Profissional", priceBrl: 59.9, monthlyCredits: 480, trial: false, trialEndsAt: null, ...overrides });
}

describe("formatBrl", () => {
  it("formats reais with comma decimals and dot thousands, plain space after R$", () => {
    expect(formatBrl(39.9)).toBe("R$ 39,90");
    expect(formatBrl(0)).toBe("R$ 0,00");
    expect(formatBrl(99.9)).toBe("R$ 99,90");
    expect(formatBrl(1234.5)).toBe("R$ 1.234,50");
    expect(formatBrl(1234567.891)).toBe("R$ 1.234.567,89");
  });
});

describe("formatDateBr", () => {
  it("renders dd/mm/aaaa in America/Sao_Paulo", () => {
    expect(formatDateBr(TRIAL_ENDS_AT)).toBe("20/10/2026");
    expect(formatDateBr(new Date("2026-01-05T12:00:00Z"))).toBe("05/01/2026");
  });
});

describe("buildSubscriptionConfirmationEmail", () => {
  it("writes the trial confirmation: first-name greeting, plan, R$ 0,00 today and the first charge date", () => {
    const { subject, html, text } = buildSubscriptionConfirmationEmail(trial());

    expect(subject).toBe("Seu teste grátis do plano Básico começou");
    expect(text).toContain("Olá, Professora!");
    expect(text).toContain("Plano: Básico");
    expect(text).toContain("Valor: R$ 39,90 por mês");
    expect(text).toContain("Créditos: 300 por mês");
    expect(text).toContain("Hoje: R$ 0,00. Em 20/10/2026 cobramos R$ 39,90 no cartão; cancele antes dessa data em Créditos e nada é cobrado. Depois, todo mês na mesma data.");
    expect(text).toContain(`Seu teste grátis de ${TRIAL_DAYS} dias do plano Básico começou.`);
    expect(text).not.toContain("Cobrado hoje");
    expect(text).toContain("Os créditos do plano zeram a cada renovação; os créditos extras não expiram.");
    expect(text).toContain("Cancele quando quiser, com um clique, em Créditos; o estorno da última cobrança também é em autoatendimento.");
    expect(text).toContain("Versão dos Termos de Uso aceita: 2026-10.1");
    expect(text).toContain("Contratação em 13/10/2026");
    expect(text).toContain("Guarde este e-mail: ele é o seu comprovante da contratação.");
    for (const path of ["/termos", "/privacidade", "/reembolso", "/creditos"]) {
      expect(text).toContain(`https://professor.olharsingular.com${path}`);
      expect(html).toContain(`href="https://professor.olharsingular.com${path}"`);
    }
    expect(html).toContain("Olá, Professora!");
    expect(html).toContain("Em 20/10/2026 cobramos R$ 39,90 no cartão; cancele antes dessa data em Créditos e nada é cobrado. Depois, todo mês na mesma data.");
    expect(html).toContain("Versão dos Termos de Uso aceita: 2026-10.1");
  });

  it("refuses a trial without its first-charge date instead of printing a bogus one", () => {
    expect(() => buildSubscriptionConfirmationEmail(trial({ trialEndsAt: null }))).toThrow(/trialEndsAt/);
    expect(buildSubscriptionConfirmationEmail(paid({ trialEndsAt: null })).text).not.toContain("1969");
  });

  it("writes the paid confirmation: charged today and monthly on the same date", () => {
    const { subject, html, text } = buildSubscriptionConfirmationEmail(paid());

    expect(subject).toBe("Sua assinatura do plano Profissional está confirmada");
    expect(text).toContain("Cobrado hoje: R$ 59,90. As próximas cobranças acontecem todo mês na mesma data.");
    expect(text).toContain("Créditos: 480 por mês");
    expect(text).not.toContain("R$ 0,00");
    expect(text).not.toContain("teste grátis");
    expect(html).toContain("Cobrado hoje: R$ 59,90.");
    expect(html).toContain("Versão dos Termos de Uso aceita: 2026-10.1");
  });

  it("omits the terms line when no version was accepted (logged-in checkout)", () => {
    for (const input of [trial({ termsVersion: null }), paid({ termsVersion: null })]) {
      const { html, text } = buildSubscriptionConfirmationEmail(input);
      expect(text).not.toContain("Versão dos Termos");
      expect(html).not.toContain("Versão dos Termos");
      expect(text).toContain("Guarde este e-mail");
    }
  });

  it("greets generically without a name and escapes the name in the HTML", () => {
    const anonymous = buildSubscriptionConfirmationEmail(paid({ fullName: null }));
    expect(anonymous.text).toContain("Olá!");
    expect(anonymous.text).not.toContain("Olá,");

    const blank = buildSubscriptionConfirmationEmail(paid({ fullName: "   " }));
    expect(blank.text).toContain("Olá!");

    const hostile = buildSubscriptionConfirmationEmail(paid({ fullName: "<b>Ana</b> & Cia", planName: "Plano <x>" }));
    expect(hostile.html).toContain("Olá, &lt;b&gt;Ana&lt;/b&gt;!");
    expect(hostile.html).toContain("Plano &lt;x&gt;");
    expect(hostile.html).not.toContain("<b>Ana</b>");
    expect(hostile.text).toContain("Olá, <b>Ana</b>!");
  });

  it("never uses an em dash and carries nothing beyond name, plan, values, dates and links", () => {
    for (const input of [trial(), paid()]) {
      const { subject, html, text } = buildSubscriptionConfirmationEmail(input);
      expect(subject + html + text).not.toContain("\u2014");
      expect(html + text).not.toMatch(/cpf|senha|token|magic|otp/i);
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain('lang="pt-BR"');
    }
  });
});

describe("sendSubscriptionConfirmation", () => {
  const CONFIG = { apiKey: "re_test", from: "Olhar Singular <contato@olharsingular.com>" };

  it("builds the e-mail and sends it to the subscriber through sendEmail", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: "msg_7" }), { status: 200 }));
    const log = vi.fn();

    const info = vi.fn();
    const result = await sendSubscriptionConfirmation({ fetch: fetchFn as unknown as typeof fetch, config: CONFIG, log, info }, { to: "ana@example.com", ...trial() });

    expect(result).toEqual({ ok: true, id: "msg_7" });
    expect(info).toHaveBeenCalledWith("email: sent", "Seu teste grátis do plano Básico começou", 200, "msg_7");
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      to: ["ana@example.com"],
      subject: "Seu teste grátis do plano Básico começou",
      tags: [{ name: "type", value: "subscription_confirmation" }],
    });
    expect(body.html).toContain("Olá, Professora!");
    expect(body.text).toContain("Olá, Professora!");
    expect(JSON.stringify(log.mock.calls)).not.toContain("ana@example.com");
  });

  it("turns a builder failure into a rejected promise, never a synchronous throw, so the checkout's background dispatch absorbs it", async () => {
    const fetchFn = vi.fn();
    const log = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let task: Promise<unknown> | undefined;
    expect(() => {
      task = sendSubscriptionConfirmation({ fetch: fetchFn as unknown as typeof fetch, config: CONFIG, log }, { to: "ana@example.com", ...trial({ trialEndsAt: null }) });
    }).not.toThrow();
    await expect(task).rejects.toThrow(/trialEndsAt/);

    const dispatched = dispatchInBackground(
      sendSubscriptionConfirmation({ fetch: fetchFn as unknown as typeof fetch, config: CONFIG, log }, { to: "ana@example.com", ...trial({ trialEndsAt: null }) }).then(() => undefined),
      {},
    );
    await expect(dispatched).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("background: task failed", "Error");
    expect(fetchFn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("answers not_configured without touching the network when there is no config", async () => {
    const fetchFn = vi.fn();
    const log = vi.fn();
    const result = await sendSubscriptionConfirmation({ fetch: fetchFn as unknown as typeof fetch, config: null, log }, { to: "ana@example.com", ...paid() });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

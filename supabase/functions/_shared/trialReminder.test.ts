import { describe, it, expect, vi } from "vitest";
import {
  buildTrialReminderEmail,
  runTrialReminders,
  toTrialReminderRow,
  type TrialReminderDeps,
  type TrialReminderRow,
} from "./trialReminder";

// Today 13/10/2026 in São Paulo; the trial ends in two days, 15/10/2026 at noon SP.
const ENDS = new Date("2026-10-15T15:00:00Z");
const APP_URL = "https://professor.olharsingular.com";

function row(overrides: Partial<TrialReminderRow> = {}): TrialReminderRow {
  return {
    subscriptionId: "sub-1",
    userId: "u1",
    email: "ana@example.com",
    fullName: "Ana Souza",
    trialEndsAt: ENDS,
    planName: "Básico",
    priceBrl: 39.9,
    monthlyCredits: 300,
    ...overrides,
  };
}

describe("buildTrialReminderEmail", () => {
  const input = { fullName: "Ana Souza", planName: "Básico", priceBrl: 39.9, monthlyCredits: 300, trialEndsAt: ENDS, appUrl: APP_URL };

  it("writes the subject with the day, the price and the way out", () => {
    expect(buildTrialReminderEmail(input).subject).toBe("Seu teste grátis termina em 15/10: cobramos R$ 39,90 nesse dia, cancele se não quiser continuar");
  });

  it("writes the body: greeting, charge, how to cancel, nothing to do, refund, legal links", () => {
    const { html, text } = buildTrialReminderEmail(input);
    expect(text).toContain("Olá, Ana!");
    expect(text).toContain("Seu teste grátis termina em 15/10/2026. Nesse dia cobramos R$ 39,90 no cartão e seu plano vira Básico, com 300 créditos por mês.");
    expect(text).toContain(`Para não ser cobrado, cancele antes de 15/10/2026, ou seja, até o dia 14/10/2026, em Créditos (${APP_URL}/creditos), com um clique: nada é cobrado e o acesso encerra na hora.`);
    expect(text).not.toContain("cancele até 15/10");
    expect(text).toContain("Se quiser continuar, não precisa fazer nada.");
    expect(text).toContain("Depois da cobrança, o estorno integral da última cobrança continua disponível em Créditos, em autoatendimento.");
    expect(text).toContain(`Termos de Uso: ${APP_URL}/termos`);
    expect(text).toContain(`Política de Reembolso: ${APP_URL}/reembolso`);
    for (const path of ["/creditos", "/termos", "/reembolso"]) expect(html).toContain(`href="${APP_URL}${path}"`);
    expect(html).toContain("Olá, Ana!");
    expect(html).toContain("Seu teste grátis termina em 15/10/2026.");
    expect(html).toContain(`cancele antes de 15/10/2026, ou seja, até o dia 14/10/2026, em <a href="${APP_URL}/creditos">Créditos</a>, com um clique`);
    expect(html).toMatch(/^<!doctype html>/i);
  });

  it("names the eve as the previous civil day in São Paulo, across month and year boundaries", () => {
    const firstOfMonth = buildTrialReminderEmail({ ...input, trialEndsAt: new Date("2026-11-01T12:00:00Z") });
    expect(firstOfMonth.text).toContain("cancele antes de 01/11/2026, ou seja, até o dia 31/10/2026,");
    const newYear = buildTrialReminderEmail({ ...input, trialEndsAt: new Date("2027-01-01T12:00:00Z") });
    expect(newYear.text).toContain("cancele antes de 01/01/2027, ou seja, até o dia 31/12/2026,");
    // 01:30 UTC on the 1st is still the 31st in São Paulo: the charge day is 31/10 and the eve 30/10.
    const lateUtc = buildTrialReminderEmail({ ...input, trialEndsAt: new Date("2026-11-01T01:30:00Z") });
    expect(lateUtc.text).toContain("cancele antes de 31/10/2026, ou seja, até o dia 30/10/2026,");
  });

  it("renders the dates in America/Sao_Paulo (an evening UTC date is still the previous day there)", () => {
    const lateUtc = buildTrialReminderEmail({ ...input, trialEndsAt: new Date("2026-10-16T01:30:00Z") });
    expect(lateUtc.subject).toContain("termina em 15/10:");
    expect(lateUtc.text).toContain("cancele antes de 15/10/2026, ou seja, até o dia 14/10/2026,");
  });

  it("greets generically without a name, escapes HTML, never uses an em dash nor payment data", () => {
    const nameless = buildTrialReminderEmail({ ...input, fullName: null });
    expect(nameless.text).toContain("Olá!");
    const hostile = buildTrialReminderEmail({ ...input, fullName: "<b>Ana</b>", planName: "Plano <x>" });
    expect(hostile.html).toContain("Olá, &lt;b&gt;Ana&lt;/b&gt;!");
    expect(hostile.html).toContain("Plano &lt;x&gt;");
    expect(hostile.html).not.toContain("<b>Ana</b>");
    const { subject, html, text } = buildTrialReminderEmail(input);
    expect(subject + html + text).not.toContain("\u2014");
    expect(html + text).not.toMatch(/cpf|senha|token|magic|otp|final \d{4}/i);
  });
});

describe("toTrialReminderRow", () => {
  it("maps a claim_trial_reminders row (numeric comes as text, timestamp as ISO)", () => {
    expect(toTrialReminderRow({
      subscription_id: "sub-9", user_id: "u9", payer_email: "x@y.z", full_name: null,
      trial_ends_at: "2026-10-15T15:00:00+00:00", plan_name: "Básico", price_brl: "39.90", monthly_credits: 300,
    })).toEqual({
      subscriptionId: "sub-9", userId: "u9", email: "x@y.z", fullName: null,
      trialEndsAt: new Date("2026-10-15T15:00:00Z"), planName: "Básico", priceBrl: 39.9, monthlyCredits: 300,
    });
    expect(toTrialReminderRow({
      subscription_id: "sub-9", user_id: "u9", payer_email: "x@y.z", full_name: "Bia",
      trial_ends_at: "2026-10-15T15:00:00Z", plan_name: "Pro", price_brl: 59.9, monthly_credits: 480,
    })).toMatchObject({ fullName: "Bia", priceBrl: 59.9 });
  });
});

describe("runTrialReminders", () => {
  function deps(rows: TrialReminderRow[], overrides: Partial<TrialReminderDeps> = {}) {
    const d = {
      claim: vi.fn(async () => rows),
      release: vi.fn(async () => undefined),
      sendEmail: vi.fn(async () => ({ ok: true as const, id: "msg_1" })),
      log: vi.fn(),
      info: vi.fn(),
      appUrl: APP_URL,
      ...overrides,
    };
    return d as TrialReminderDeps & typeof d;
  }

  it("does nothing when nobody is due", async () => {
    const d = deps([]);
    expect(await runTrialReminders(d)).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("sends one reminder per claimed row and keeps the claim on success", async () => {
    const d = deps([row(), row({ subscriptionId: "sub-2", email: "bia@example.com", fullName: "Bia" })]);
    expect(await runTrialReminders(d)).toEqual({ claimed: 2, sent: 2, failed: 0 });

    expect(d.sendEmail).toHaveBeenCalledTimes(2);
    const first = d.sendEmail.mock.calls[0][0];
    expect(first).toMatchObject({ to: "ana@example.com", tags: [{ name: "type", value: "trial_reminder" }] });
    expect(first.subject).toContain("Seu teste grátis termina em 15/10");
    expect(first.text).toContain("Olá, Ana!");
    expect(first.html).toContain(`href="${APP_URL}/creditos"`);
    expect(d.sendEmail.mock.calls[1][0]).toMatchObject({ to: "bia@example.com" });
    expect(d.release).not.toHaveBeenCalled();
    expect(d.info).toHaveBeenCalledWith("trial-reminders: sent", "sub-1", "msg_1");
    expect(d.log).not.toHaveBeenCalled();
    expect(JSON.stringify(d.info.mock.calls) + JSON.stringify(d.log.mock.calls)).not.toMatch(/ana@example.com|bia@example.com/);
  });

  it("falls back to console.log for the success line when no info logger is injected (warnings stay on log)", async () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const d = deps([row()], { info: undefined });
    await runTrialReminders(d);
    expect(info).toHaveBeenCalledWith("trial-reminders: sent", "sub-1", "msg_1");
    expect(d.log).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("releases the row when the provider refuses, so the next run retries", async () => {
    const d = deps([row()], { sendEmail: vi.fn(async () => ({ ok: false as const, reason: "http_422" as const })) });
    expect(await runTrialReminders(d)).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(d.release).toHaveBeenCalledWith("sub-1");
    expect(d.log).toHaveBeenCalledWith("trial-reminders: send failed, released", "sub-1", "http_422");
  });

  it("treats an exception from sendEmail as a failure: releases, counts, never throws", async () => {
    const d = deps([row(), row({ subscriptionId: "sub-2" })], {
      sendEmail: vi.fn()
        .mockRejectedValueOnce(new Error("socket hang up for ana@example.com"))
        .mockResolvedValueOnce({ ok: true, id: "msg_2" }),
    });
    await expect(runTrialReminders(d)).resolves.toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(d.release).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledWith("sub-1");
    expect(d.log).toHaveBeenCalledWith("trial-reminders: send threw, released", "sub-1", "Error");
    expect(JSON.stringify(d.log.mock.calls)).not.toContain("ana@example.com");
  });

  it("logs a failing release and carries on with the next row", async () => {
    const d = deps([row(), row({ subscriptionId: "sub-2" })], {
      sendEmail: vi.fn(async () => ({ ok: false as const, reason: "timeout" as const })),
      release: vi.fn().mockRejectedValueOnce(new Error("rpc down")).mockResolvedValueOnce(undefined),
    });
    await expect(runTrialReminders(d)).resolves.toEqual({ claimed: 2, sent: 0, failed: 2 });
    expect(d.release).toHaveBeenCalledTimes(2);
    expect(d.log).toHaveBeenCalledWith("trial-reminders: release failed, row stays claimed", "sub-1", "rpc down");
    expect(d.log).toHaveBeenCalledWith("trial-reminders: send failed, released", "sub-2", "timeout");
    const throwingValue = deps([row()], {
      sendEmail: vi.fn(async () => { throw "weird"; }),
      release: vi.fn(async () => { throw "weird"; }),
    });
    await expect(runTrialReminders(throwingValue)).resolves.toEqual({ claimed: 1, sent: 0, failed: 1 });
  });

  it("treats a row the builder cannot render as a failure too: released and counted, the loop goes on", async () => {
    // An invalid timestamp makes Intl throw inside buildTrialReminderEmail.
    const d = deps([row({ trialEndsAt: new Date("x") }), row({ subscriptionId: "sub-2" })]);
    await expect(runTrialReminders(d)).resolves.toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledWith("sub-1");
    expect(d.log).toHaveBeenCalledWith("trial-reminders: send threw, released", "sub-1", "RangeError");

    const single = deps([row({ trialEndsAt: new Date("x") })]);
    await expect(runTrialReminders(single)).resolves.toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(single.release).toHaveBeenCalledWith("sub-1");
  });

  it("lets a failing claim surface: nothing was marked, the caller answers 500", async () => {
    const d = deps([], { claim: vi.fn(async () => { throw new Error("claim_trial_reminders failed: db down"); }) });
    await expect(runTrialReminders(d)).rejects.toThrow("claim_trial_reminders failed");
  });
});

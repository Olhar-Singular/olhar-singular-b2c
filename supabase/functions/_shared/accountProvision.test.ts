import { describe, it, expect, vi } from "vitest";
import { parseAccountInput, runAnonymousCheckout, type CheckoutDeps, type CheckoutInput } from "./accountProvision";
import type { SubscribeDeps } from "./subscribeFlow";

const PLAN = { id: "pl-pro", slug: "profissional", name: "Profissional", price_brl: 59.9, monthly_credits: 480, active: true, admin_only: false };
const CARD = { token: "tok", payment_method_id: "master", payer: { identification: { type: "CPF", number: "123.456.789-09" } } };

function subscribeDeps(preapproval: Record<string, unknown> = { id: "pre-1", status: "authorized" }): SubscribeDeps {
  return {
    loadPlan: vi.fn(async () => PLAN),
    loadCheapestPublicPlan: vi.fn(async () => PLAN),
    loadProfile: vi.fn(async () => ({ access_kind: "subscriber", is_super_admin: false })),
    findLiveSubscription: vi.fn(async () => null),
    expireStalePending: vi.fn(async () => undefined),
    insertSubscription: vi.fn(async () => "sub-1"),
    postPreapproval: vi.fn(async () => ({ ok: true, status: 201, json: preapproval })),
    searchPreapprovalByRef: vi.fn(async () => null),
    activate: vi.fn(async () => ({ success: true })),
    cancelPreapproval: vi.fn(async () => undefined),
    markPending: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    log: vi.fn(),
  };
}

function deps(overrides: Partial<CheckoutDeps> = {}, preapproval?: Record<string, unknown>) {
  const d = {
    subscribeDeps: subscribeDeps(preapproval),
    hash: vi.fn(async (v: string) => `h(${v})`),
    recordAttempt: vi.fn(async () => ({ by_email_1h: 1, by_ip_1h: 1, rejected_10m: 0 })),
    createUser: vi.fn(async () => ({ id: "new-user" })),
    recordProfileFacts: vi.fn(async () => undefined),
    trialUsedByCpf: vi.fn(async () => false),
    deleteUser: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
  return d as CheckoutDeps & typeof d;
}

function anonymous(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    user: null,
    account: { fullName: "Ana Souza", email: "a.na+x@gmail.com", termsVersion: "2026-09" },
    planSlug: "profissional",
    card: CARD,
    cardLastFour: "1234",
    backUrl: "https://app/creditos",
    clientIp: "203.0.113.9",
    ...overrides,
  };
}

describe("parseAccountInput", () => {
  it("accepts a name, e-mail and terms version, normalising the e-mail", () => {
    expect(parseAccountInput({ fullName: " Ana Souza ", email: " Ana@Example.com ", termsVersion: "2026-09" })).toEqual({
      ok: true,
      account: { fullName: "Ana Souza", email: "ana@example.com", termsVersion: "2026-09" },
    });
  });

  it("rejects missing or malformed fields", () => {
    expect(parseAccountInput(null)).toEqual({ ok: false, error: "invalid_account" });
    expect(parseAccountInput({ fullName: "A", email: "a@b.co", termsVersion: "1" })).toEqual({ ok: false, error: "invalid_account" });
    expect(parseAccountInput({ fullName: "x".repeat(121), email: "a@b.co", termsVersion: "1" })).toEqual({ ok: false, error: "invalid_account" });
    expect(parseAccountInput({ fullName: "Ana", email: "nope", termsVersion: "1" })).toEqual({ ok: false, error: "invalid_email" });
    expect(parseAccountInput({ fullName: "Ana", email: "a@b.co" })).toEqual({ ok: false, error: "terms_required" });
    expect(parseAccountInput({ fullName: "Ana", email: "a@b.co", termsVersion: "bad version!" })).toEqual({ ok: false, error: "terms_required" });
  });
});

describe("runAnonymousCheckout", () => {
  it("creates the account, subscribes, records CPF and terms, and never returns a session", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(anonymous(), d);

    expect(d.hash).toHaveBeenCalledWith("203.0.113.9");
    expect(d.hash).toHaveBeenCalledWith("ana@gmail.com");
    expect(d.recordAttempt).toHaveBeenNthCalledWith(1, "h(203.0.113.9)", "h(ana@gmail.com)", "attempt");
    expect(d.createUser).toHaveBeenCalledWith({ email: "a.na+x@gmail.com", fullName: "Ana Souza" });
    expect(d.subscribeDeps.insertSubscription).toHaveBeenCalledWith(expect.objectContaining({ userId: "new-user", payerEmail: "a.na+x@gmail.com" }));
    expect(d.recordAttempt).toHaveBeenNthCalledWith(2, "h(203.0.113.9)", "h(ana@gmail.com)", "authorized");
    expect(d.recordProfileFacts).toHaveBeenCalledWith({ userId: "new-user", cpf: "12345678909", termsVersion: "2026-09" });
    expect(out).toEqual({
      ok: true,
      result: { ok: true, status: "authorized", subscriptionId: "sub-1", planSlug: "profissional", priceBrl: 59.9 },
      userId: "new-user",
      accountCreated: true,
    });
    expect(JSON.stringify(out)).not.toMatch(/token/i);
  });

  it("records the profile facts on pending too (the webhook activates later)", async () => {
    const d = deps({}, { id: "pre-2", status: "pending" });
    const out = await runAnonymousCheckout(anonymous(), d);
    expect(out).toMatchObject({ ok: true, result: { status: "pending" }, accountCreated: true });
    expect(d.recordProfileFacts).toHaveBeenCalled();
  });

  it("keeps the account on a rejected card and records nothing on the profile", async () => {
    const d = deps({}, { id: "pre-3", status: "cancelled" });
    const out = await runAnonymousCheckout(anonymous(), d);
    expect(out).toEqual({
      ok: true,
      result: { ok: true, status: "rejected", subscriptionId: "sub-1", detail: "cancelled", planSlug: "profissional", priceBrl: 59.9 },
      userId: "new-user",
      accountCreated: true,
    });
    expect(d.recordAttempt).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "rejected");
    expect(d.recordProfileFacts).not.toHaveBeenCalled();
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("uses the logged-in user without creating an account", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(anonymous({ user: { id: "u1", email: "u1@x.com" }, account: null }), d);
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.subscribeDeps.insertSubscription).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", payerEmail: "u1@x.com" }));
    expect(d.recordProfileFacts).toHaveBeenCalledWith({ userId: "u1", cpf: "12345678909", termsVersion: null });
    expect(out).toMatchObject({ ok: true, userId: "u1", accountCreated: false });
  });

  it("prefers the JWT user over an account block sent alongside", async () => {
    const d = deps();
    await runAnonymousCheckout(anonymous({ user: { id: "u1", email: "u1@x.com" } }), d);
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.hash).toHaveBeenCalledWith("u1@x.com");
  });

  it("refuses an anonymous request without the account block", async () => {
    const d = deps();
    expect(await runAnonymousCheckout(anonymous({ account: null }), d)).toEqual({ ok: false, error: "account_required", httpStatus: 400 });
    expect(d.recordAttempt).not.toHaveBeenCalled();
  });

  it("rate-limits and opens the circuit before touching auth or MP", async () => {
    const limited = deps({ recordAttempt: vi.fn(async () => ({ by_email_1h: 6, by_ip_1h: 1, rejected_10m: 0 })) });
    expect(await runAnonymousCheckout(anonymous(), limited)).toEqual({ ok: false, error: "rate_limited", httpStatus: 429 });
    expect(limited.recordAttempt).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), "refused");
    expect(limited.createUser).not.toHaveBeenCalled();

    const storm = deps({ recordAttempt: vi.fn(async () => ({ by_email_1h: 1, by_ip_1h: 1, rejected_10m: 1, rejected_10m_ip: 3 })) });
    expect(await runAnonymousCheckout(anonymous(), storm)).toEqual({ ok: false, error: "circuit_open", httpStatus: 503 });
    expect(storm.subscribeDeps.postPreapproval).not.toHaveBeenCalled();
  });

  it("answers 409 email_exists so the UI can offer login", async () => {
    const d = deps({ createUser: vi.fn(async () => "exists" as const) });
    expect(await runAnonymousCheckout(anonymous(), d)).toEqual({ ok: false, error: "email_exists", httpStatus: 409 });
    expect(d.subscribeDeps.postPreapproval).not.toHaveBeenCalled();
  });

  it("propagates business refusals from runSubscribe without a session", async () => {
    const d = deps();
    (d.subscribeDeps.findLiveSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "old", status: "authorized" });
    expect(await runAnonymousCheckout(anonymous(), d)).toEqual({ ok: false, error: "already_subscribed", httpStatus: 409 });
  });


  it("stores a null CPF when the Brick did not report a valid one", async () => {
    const d = deps();
    await runAnonymousCheckout(anonymous({ card: { token: "tok", payment_method_id: "visa" } }), d);
    expect(d.recordProfileFacts).toHaveBeenCalledWith(expect.objectContaining({ cpf: null }));
  });
});

describe("runAnonymousCheckout (trial with card)", () => {
  const NOW = new Date("2026-09-15T21:52:15.000Z");

  it("checks the CPF before creating the account and runs the trial", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(anonymous({ trial: true, now: NOW }), d);
    expect(d.trialUsedByCpf).toHaveBeenCalledWith("12345678909");
    expect(d.createUser).toHaveBeenCalled();
    expect(d.subscribeDeps.insertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user", trialEndsAt: "2026-09-22T21:52:15.000Z" }),
    );
    expect(out).toMatchObject({ ok: true, result: { status: "authorized", trialEndsAt: "2026-09-22T21:52:15.000Z" }, accountCreated: true });
    expect(d.recordProfileFacts).toHaveBeenCalledWith({ userId: "new-user", cpf: "12345678909", termsVersion: "2026-09" });
  });

  it("refuses a CPF that already had a trial or a subscription, leaving no account behind", async () => {
    const d = deps({ trialUsedByCpf: vi.fn(async () => true) });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(out).toEqual({ ok: false, error: "trial_used", httpStatus: 409 });
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.subscribeDeps.postPreapproval).not.toHaveBeenCalled();
  });

  it("requires a valid CPF for the trial (a scripted caller cannot skip decision 4)", async () => {
    const d = deps();
    const noCpf = { ...CARD, payer: { identification: { type: "CPF", number: "111.111.111-11" } } };
    const out = await runAnonymousCheckout(anonymous({ trial: true, card: noCpf }), d);
    expect(out).toEqual({ ok: false, error: "cpf_required", httpStatus: 400 });
    expect(d.trialUsedByCpf).not.toHaveBeenCalled();
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("is for new accounts only: a logged-in user asking for the trial is refused", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(
      anonymous({ trial: true, user: { id: "u1", email: "a@b.c" }, account: null }),
      d,
    );
    expect(out).toEqual({ ok: false, error: "trial_requires_new_account", httpStatus: 400 });
    expect(d.recordAttempt).not.toHaveBeenCalled();
  });

  it("still applies the rate limit before the CPF check", async () => {
    const d = deps({ recordAttempt: vi.fn(async () => ({ by_email_1h: 6, by_ip_1h: 1, rejected_10m: 0 })) });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(out).toMatchObject({ ok: false, error: "rate_limited" });
    expect(d.trialUsedByCpf).not.toHaveBeenCalled();
  });

  it("deletes the just-created account when a trial card is refused, so the e-mail can retry", async () => {
    const d = deps({}, { id: "pre-4", status: "cancelled" });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
    expect(d.recordProfileFacts).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: true, result: { status: "rejected" }, accountCreated: false });
  });

  it("keeps the account and logs an ALERT when deleting the refused trial account fails", async () => {
    const deleteError = new Error("admin api down");
    const d = deps({ deleteUser: vi.fn(async () => { throw deleteError; }) }, { id: "pre-5", status: "cancelled" });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(d.deleteUser).toHaveBeenCalledWith("new-user");
    expect(d.log).toHaveBeenCalledWith(
      "subscribe: ALERT could not delete the account of a refused trial card", "new-user", deleteError,
    );
    expect(out).toMatchObject({ ok: true, result: { status: "rejected" }, accountCreated: true });
  });

  it("does not delete the account when the trial card is authorized", async () => {
    const d = deps({}, { id: "pre-6", status: "authorized" });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: true, accountCreated: true });
  });
});

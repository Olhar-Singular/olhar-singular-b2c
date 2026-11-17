import { describe, it, expect, vi } from "vitest";
import { runPixPlanCheckout, type PixPlanCheckoutDeps, type PixPlanCheckoutInput } from "./pixPlanCheckout";
import type { PrepaidPlanRow } from "./prepaidPlans";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const THREE: PrepaidPlanRow = { id: "pp-3", slug: "pix-3-meses", months: 3, credits: 900, price_brl: "89.90", active: true, admin_only: false };
const SMOKE: PrepaidPlanRow = { id: "pp-t", slug: "pix-teste-admin", months: 1, credits: 1, price_brl: 1, active: true, admin_only: true };
const QR_PAYMENT = {
  id: 987,
  status: "pending",
  point_of_interaction: { transaction_data: { qr_code: "000201pix", qr_code_base64: "iVBOR", ticket_url: "https://mp/t" } },
};

function input(overrides: Partial<PixPlanCheckoutInput> = {}): PixPlanCheckoutInput {
  return {
    user: null,
    account: { fullName: "Ana Souza", email: "ana@example.com", termsVersion: "2026-11.1" },
    planSlug: "pix-3-meses",
    clientIp: "1.2.3.4",
    notificationUrl: "https://x.supabase.co/functions/v1/mp-webhook",
    now: NOW,
    ...overrides,
  };
}

function deps(overrides: Partial<PixPlanCheckoutDeps> = {}) {
  const d = {
    hash: vi.fn(async (v: string) => `h(${v})`),
    recordAttempt: vi.fn(async () => ({ by_email_1h: 1, by_ip_1h: 1, rejected_10m: 0 })),
    loadPlan: vi.fn(async (slug: string) => (slug === "pix-3-meses" ? THREE : slug === "pix-teste-admin" ? SMOKE : null)),
    loadProfile: vi.fn(async () => ({ access_kind: "subscriber", is_super_admin: false })),
    hasLiveSubscription: vi.fn(async () => false),
    userIdByEmail: vi.fn(async () => null as string | null),
    insertPurchase: vi.fn(async () => ({ id: "pur-1" })),
    createPixPayment: vi.fn(async () => ({ ok: true, status: 201, json: QR_PAYMENT as Record<string, unknown> })),
    storePaymentId: vi.fn(async () => {}),
    cancelPurchase: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  };
  return d as typeof d & PixPlanCheckoutDeps;
}

describe("runPixPlanCheckout", () => {
  it("asks for an account when nobody is logged in", async () => {
    const d = deps();
    expect(await runPixPlanCheckout(input({ account: null }), d)).toEqual({ ok: false, error: "account_required", httpStatus: 400 });
    expect(d.recordAttempt).not.toHaveBeenCalled();
  });

  it("creates the anonymous purchase from the catalogue row, never from the request", async () => {
    const d = deps();
    const result = await runPixPlanCheckout(input(), d);

    expect(d.insertPurchase).toHaveBeenCalledWith({
      kind: "plan",
      status: "pending",
      provider: "mercadopago",
      payment_method: "pix",
      user_id: null,
      buyer_email: "ana@example.com",
      buyer_name: "Ana Souza",
      terms_version: "2026-11.1",
      prepaid_plan_id: "pp-3",
      plan_months: 3,
      amount_brl: 89.9,
      credits_granted: 900,
    });
    expect(result).toEqual({
      ok: true,
      purchaseId: "pur-1",
      qrCode: "000201pix",
      qrCodeBase64: "iVBOR",
      ticketUrl: "https://mp/t",
      expiresAt: "2026-11-15T16:00:00.000Z",
      amountBrl: 89.9,
      credits: 900,
      months: 3,
    });
  });

  it("charges MP with the purchase id as idempotency key and the plan description", async () => {
    const d = deps();
    await runPixPlanCheckout(input(), d);
    const [body, key] = d.createPixPayment.mock.calls[0] as unknown as [Record<string, unknown>, string];
    expect(key).toBe("pur-1");
    expect(body).toMatchObject({
      transaction_amount: 89.9,
      description: "Plano à vista 3 meses - Olhar Singular",
      payment_method_id: "pix",
      external_reference: "pur-1",
      notification_url: "https://x.supabase.co/functions/v1/mp-webhook",
      payer: { email: "ana@example.com" },
    });
    expect(d.storePaymentId).toHaveBeenCalledWith("pur-1", "987");
  });

  it("records the attempt, then the pending outcome, hashing the normalized e-mail", async () => {
    const d = deps();
    await runPixPlanCheckout(input({ account: { fullName: "Ana", email: "ana@example.com", termsVersion: "2026-11.1" } }), d);
    expect(d.recordAttempt).toHaveBeenNthCalledWith(1, "h(1.2.3.4)", "h(ana@example.com)", "attempt");
    expect(d.recordAttempt).toHaveBeenLastCalledWith("h(1.2.3.4)", "h(ana@example.com)", "pending");
  });

  it("stops a rate-limited buyer before anything is created", async () => {
    const d = deps({ recordAttempt: vi.fn(async () => ({ by_email_1h: 6, by_ip_1h: 1, rejected_10m: 0 })) });
    expect(await runPixPlanCheckout(input(), d)).toEqual({ ok: false, error: "rate_limited", httpStatus: 429 });
    expect(d.recordAttempt).toHaveBeenLastCalledWith("h(1.2.3.4)", "h(ana@example.com)", "refused");
    expect(d.insertPurchase).not.toHaveBeenCalled();
  });

  it("refuses an unknown or non-string plan", async () => {
    expect(await runPixPlanCheckout(input({ planSlug: "pix-99-meses" }), deps())).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
    expect(await runPixPlanCheckout(input({ planSlug: 3 }), deps())).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
  });

  it("keeps the smoke offer for logged-in super-admins", async () => {
    expect(await runPixPlanCheckout(input({ planSlug: "pix-teste-admin" }), deps())).toMatchObject({ error: "invalid_plan" });
    const admin = deps({ loadProfile: vi.fn(async () => ({ access_kind: "exempt", is_super_admin: true })) });
    const result = await runPixPlanCheckout(input({ user: { id: "u-admin", email: "admin@x.com" }, account: null, planSlug: "pix-teste-admin" }), admin);
    expect(result).toMatchObject({ ok: true, credits: 1 });
    expect(admin.insertPurchase).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-admin", buyer_email: null, buyer_name: null, terms_version: null }));
  });

  it("answers email_exists when the anonymous e-mail already has an account", async () => {
    const d = deps({ userIdByEmail: vi.fn(async () => "u-existing") });
    expect(await runPixPlanCheckout(input(), d)).toEqual({ ok: false, error: "email_exists", httpStatus: 409 });
    expect(d.userIdByEmail).toHaveBeenCalledWith("ana@example.com");
    expect(d.insertPurchase).not.toHaveBeenCalled();
  });

  it("refuses a logged-in buyer with a live card subscription (R6)", async () => {
    const d = deps({ hasLiveSubscription: vi.fn(async () => true) });
    const result = await runPixPlanCheckout(input({ user: { id: "u1", email: "u1@x.com" }, account: null }), d);
    expect(result).toEqual({ ok: false, error: "already_subscribed", httpStatus: 409 });
    expect(d.hasLiveSubscription).toHaveBeenCalledWith("u1");
  });

  it("refuses courtesy accounts and a missing profile", async () => {
    const exempt = deps({ loadProfile: vi.fn(async () => ({ access_kind: "exempt", is_super_admin: false })) });
    expect(await runPixPlanCheckout(input({ user: { id: "u1", email: "u1@x.com" }, account: null }), exempt)).toEqual({ ok: false, error: "exempt_user", httpStatus: 403 });
    const ghost = deps({ loadProfile: vi.fn(async () => null) });
    expect(await runPixPlanCheckout(input({ user: { id: "u1", email: "u1@x.com" }, account: null }), ghost)).toEqual({ ok: false, error: "profile_not_found", httpStatus: 404 });
  });

  it("logged-in buyers use their account e-mail and skip the existing-account check", async () => {
    const d = deps();
    await runPixPlanCheckout(input({ user: { id: "u1", email: "u1@x.com" }, account: null }), d);
    expect(d.userIdByEmail).not.toHaveBeenCalled();
    expect(d.insertPurchase).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1" }));
    expect(d.createPixPayment.mock.calls[0][0]).toMatchObject({ payer: { email: "u1@x.com" } });
  });

  it("closes the purchase and reports provider_error when MP has no QR", async () => {
    const noQr = deps({ createPixPayment: vi.fn(async () => ({ ok: true, status: 201, json: { id: 1 } })) });
    expect(await runPixPlanCheckout(input(), noQr)).toEqual({ ok: false, error: "provider_error", httpStatus: 502 });
    expect(noQr.cancelPurchase).toHaveBeenCalledWith("pur-1");

    const refused = deps({ createPixPayment: vi.fn(async () => ({ ok: false, status: 400, json: { message: "bad" } })) });
    expect(await runPixPlanCheckout(input(), refused)).toMatchObject({ error: "provider_error" });
    expect(refused.log).toHaveBeenCalled();

    const down = deps({ createPixPayment: vi.fn(async () => { throw new Error("ECONNRESET"); }) });
    expect(await runPixPlanCheckout(input(), down)).toMatchObject({ error: "provider_error" });
    expect(down.cancelPurchase).toHaveBeenCalledWith("pur-1");
  });

  it("still answers with the QR when storing the payment id fails (the webhook finds it by reference)", async () => {
    const d = deps({ storePaymentId: vi.fn(async () => { throw new Error("db"); }) });
    expect(await runPixPlanCheckout(input(), d)).toMatchObject({ ok: true, purchaseId: "pur-1" });
    expect(d.log).toHaveBeenCalled();
  });

  it("logs non-Error failures as they came", async () => {
    const down = deps({ createPixPayment: vi.fn(() => Promise.reject("socket hang up")) });
    await runPixPlanCheckout(input(), down);
    expect(down.log).toHaveBeenCalledWith(expect.any(String), "socket hang up", "purchase:", "pur-1");

    const db = deps({ storePaymentId: vi.fn(() => Promise.reject("db gone")) });
    await runPixPlanCheckout(input(), db);
    expect(db.log).toHaveBeenCalledWith(expect.any(String), "pur-1", "db gone");
  });

  it("counts the QR's hour from the current time by default", async () => {
    const before = Date.now();
    const result = await runPixPlanCheckout(input({ now: undefined }), deps());
    const expiresAt = Date.parse((result as { expiresAt: string }).expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
  });
});

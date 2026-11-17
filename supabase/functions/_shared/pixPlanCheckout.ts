// The Pix prepaid plan checkout (spec 2026-11-15-checkout-pix-a-vista), with
// its I/O injected so every decision is unit-tested away from Deno.
//
// Generating a QR moves no money, so it creates no account (R4): an anonymous
// buyer's name, e-mail and terms acceptance ride on the pending purchase, and
// mp-webhook opens (or finds) the account only when MP confirms the payment.
// An e-mail that already has an account is sent to the login instead, exactly
// like the card checkout.

import type { AccountInput } from "./accountProvision.ts";
import { decideCheckoutAccess, normalizeEmail, type AttemptCounts } from "./checkoutGuard.ts";
import { buildPixPaymentBody, extractPixQr, PIX_EXPIRES_AFTER_SECONDS } from "./mpPixPayment.ts";
import { prepaidDescription, selectPrepaidPlan, type PrepaidPlanRow } from "./prepaidPlans.ts";

export interface PixPlanCheckoutInput {
  /** Set when a valid user JWT came with the request. */
  user: { id: string; email: string } | null;
  /** Required when `user` is null. */
  account: AccountInput | null;
  planSlug: unknown;
  clientIp: string;
  notificationUrl: string;
  now?: Date;
}

export interface PlanPurchaseInsert {
  kind: "plan";
  status: "pending";
  provider: "mercadopago";
  payment_method: "pix";
  user_id: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  terms_version: string | null;
  prepaid_plan_id: string;
  plan_months: number;
  amount_brl: number;
  credits_granted: number;
}

export interface PixPlanCheckoutDeps {
  hash(value: string): Promise<string>;
  /** RPC record_checkout_attempt: inserts the outcome and returns the rolling counts. */
  recordAttempt(ipHash: string, emailHash: string, outcome: "attempt" | "pending" | "refused"): Promise<AttemptCounts>;
  loadPlan(slug: string): Promise<PrepaidPlanRow | null>;
  loadProfile(userId: string): Promise<{ access_kind: string; is_super_admin: boolean } | null>;
  /** A subscription in authorized, past_due or paused. */
  hasLiveSubscription(userId: string): Promise<boolean>;
  /** RPC user_id_by_email. */
  userIdByEmail(email: string): Promise<string | null>;
  insertPurchase(row: PlanPurchaseInsert): Promise<{ id: string }>;
  /** POST /v1/payments with X-Idempotency-Key. */
  createPixPayment(body: Record<string, unknown>, idempotencyKey: string): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }>;
  storePaymentId(purchaseId: string, paymentId: string): Promise<void>;
  /** Closes a purchase whose QR never existed, so it does not linger as payable. */
  cancelPurchase(purchaseId: string): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

export type PixPlanCheckoutResult =
  | {
      ok: true;
      purchaseId: string;
      qrCode: string;
      qrCodeBase64: string;
      ticketUrl?: string;
      expiresAt: string;
      amountBrl: number;
      credits: number;
      months: number;
    }
  | {
      ok: false;
      error:
        | "account_required" | "invalid_plan" | "profile_not_found" | "exempt_user"
        | "already_subscribed" | "email_exists" | "rate_limited" | "circuit_open" | "provider_error";
      httpStatus: number;
    };

export async function runPixPlanCheckout(input: PixPlanCheckoutInput, deps: PixPlanCheckoutDeps): Promise<PixPlanCheckoutResult> {
  if (!input.user && !input.account) return { ok: false, error: "account_required", httpStatus: 400 };
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.user?.email ?? input.account!.email);

  const [ipHash, emailHash] = await Promise.all([deps.hash(input.clientIp), deps.hash(email)]);
  const access = decideCheckoutAccess(await deps.recordAttempt(ipHash, emailHash, "attempt"));
  if (!access.allowed) {
    await deps.recordAttempt(ipHash, emailHash, "refused");
    return { ok: false, error: access.reason, httpStatus: access.httpStatus };
  }

  const profile = input.user ? await deps.loadProfile(input.user.id) : null;
  if (input.user && !profile) return { ok: false, error: "profile_not_found", httpStatus: 404 };
  const isSuperAdmin = profile?.is_super_admin === true;

  const row = typeof input.planSlug === "string" ? await deps.loadPlan(input.planSlug) : null;
  const plan = selectPrepaidPlan(row ? [row] : [], input.planSlug, { allowAdminOnly: isSuperAdmin });
  if (!plan) return { ok: false, error: "invalid_plan", httpStatus: 400 };

  if (input.user) {
    if (profile!.access_kind === "exempt" && !isSuperAdmin) return { ok: false, error: "exempt_user", httpStatus: 403 };
    if (await deps.hasLiveSubscription(input.user.id)) return { ok: false, error: "already_subscribed", httpStatus: 409 };
  } else if (await deps.userIdByEmail(email)) {
    return { ok: false, error: "email_exists", httpStatus: 409 };
  }

  const purchase = await deps.insertPurchase({
    kind: "plan",
    status: "pending",
    provider: "mercadopago",
    payment_method: "pix",
    user_id: input.user?.id ?? null,
    buyer_email: input.user ? null : email,
    buyer_name: input.account && !input.user ? input.account.fullName : null,
    terms_version: input.account && !input.user ? input.account.termsVersion : null,
    prepaid_plan_id: plan.id,
    plan_months: plan.months,
    amount_brl: plan.priceBrl,
    credits_granted: plan.credits,
  });

  const body = buildPixPaymentBody({
    pkg: { credits: plan.credits, amountBrl: plan.priceBrl },
    purchaseId: purchase.id,
    email,
    notificationUrl: input.notificationUrl,
    now,
    description: prepaidDescription(plan),
  });

  let resp: { ok: boolean; status: number; json: Record<string, unknown> };
  try {
    // The purchase id is the idempotency key: one row, one charge, even on retry.
    resp = await deps.createPixPayment(body, purchase.id);
  } catch (e) {
    deps.log("pix-plan-checkout: MP unreachable", e instanceof Error ? e.message : e, "purchase:", purchase.id);
    resp = { ok: false, status: 0, json: {} };
  }

  const qr = resp.ok ? extractPixQr(resp.json) : null;
  if (!qr) {
    // MP echoes submitted fields in validation errors: log the status only.
    deps.log("pix-plan-checkout: no Pix QR", resp.status, "purchase:", purchase.id);
    await deps.cancelPurchase(purchase.id);
    return { ok: false, error: "provider_error", httpStatus: 502 };
  }

  try {
    await deps.storePaymentId(purchase.id, qr.paymentId);
  } catch (e) {
    // Not fatal: the webhook resolves the purchase by external_reference.
    deps.log("pix-plan-checkout: store payment_id failed", purchase.id, e instanceof Error ? e.message : e);
  }

  await deps.recordAttempt(ipHash, emailHash, "pending");

  return {
    ok: true,
    purchaseId: purchase.id,
    qrCode: qr.qrCode,
    qrCodeBase64: qr.qrCodeBase64,
    ticketUrl: qr.ticketUrl,
    expiresAt: new Date(now.getTime() + PIX_EXPIRES_AFTER_SECONDS * 1000).toISOString(),
    amountBrl: plan.priceBrl,
    credits: plan.credits,
    months: plan.months,
  };
}

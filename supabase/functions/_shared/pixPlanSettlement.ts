// What mp-webhook does with a Pix prepaid plan (spec 2026-11-15-checkout-pix-a-vista),
// with its I/O injected so every decision is unit-tested away from Deno.
//
// Approval (R4): the account is born here, never at the QR. An anonymous buyer's
// e-mail is looked up or a new account is opened (must_set_password), then the
// RPC grants the credits atomically. The access link and the receipt are best
// effort: a dead e-mail provider must not undo a paid plan or make MP retry.
//
// Refund (R3): money that went back (MP panel refund or chargeback) takes the
// plan's credits out through refund_prepaid_plan.

import type { PrepaidConfirmationInput } from "./prepaidEmails.ts";

export interface PlanPurchaseRow {
  kind: string;
  status: string;
  user_id: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  terms_version: string | null;
  plan_months: number | null;
  /** numeric comes back from PostgREST as a string. */
  amount_brl: number | string;
  credits_granted: number;
}

export interface SettleApprovedInput {
  purchaseId: string;
  paymentId: string;
  /** Public app URL without a trailing slash (APP_URL), for the receipt links. */
  appUrl: string;
  now?: Date;
}

export interface PlanSettlementDeps {
  loadPurchase(purchaseId: string): Promise<PlanPurchaseRow | null>;
  /** RPC user_id_by_email. */
  userIdByEmail(email: string): Promise<string | null>;
  /** auth.admin.createUser with a random password and must_set_password; "exists" when the e-mail is taken. */
  createUser(input: { email: string; fullName: string | null }): Promise<{ id: string } | "exists">;
  /** E-mail and name of a logged-in buyer, for the receipt. */
  loadContact(userId: string): Promise<{ email: string; fullName: string | null } | null>;
  /** RPC approve_prepaid_plan. */
  approve(purchaseId: string, paymentId: string, userId: string): Promise<Record<string, unknown>>;
  /** signInWithOtp to the buyer's e-mail (the same login e-mail as the card funnel). */
  sendLoginLink(email: string): Promise<void>;
  sendConfirmation(input: PrepaidConfirmationInput & { to: string }): Promise<unknown>;
  log(message: string, ...args: unknown[]): void;
}

export interface SettleApprovedResult {
  granted: boolean;
  userId?: string;
  accountCreated?: boolean;
}

async function resolveBuyer(row: PlanPurchaseRow, deps: PlanSettlementDeps): Promise<{ userId: string; created: boolean }> {
  if (row.user_id) return { userId: row.user_id, created: false };
  if (!row.buyer_email) throw new Error("pix plan settlement: purchase has neither user nor buyer e-mail");

  const existing = await deps.userIdByEmail(row.buyer_email);
  if (existing) return { userId: existing, created: false };

  const created = await deps.createUser({ email: row.buyer_email, fullName: row.buyer_name });
  if (created !== "exists") return { userId: created.id, created: true };

  // Another request opened the account between the lookup and the create.
  const raced = await deps.userIdByEmail(row.buyer_email);
  if (!raced) throw new Error("pix plan settlement: account neither found nor created");
  return { userId: raced, created: false };
}

export async function settleApprovedPlan(input: SettleApprovedInput, deps: PlanSettlementDeps): Promise<SettleApprovedResult> {
  const row = await deps.loadPurchase(input.purchaseId);
  if (!row || row.kind !== "plan" || row.status !== "pending") return { granted: false };

  const anonymous = !row.user_id;
  const { userId, created } = await resolveBuyer(row, deps);
  const result = await deps.approve(input.purchaseId, input.paymentId, userId);
  if (result.granted !== true) return { granted: false, userId, accountCreated: created };

  if (anonymous) {
    try {
      await deps.sendLoginLink(row.buyer_email as string);
    } catch (e) {
      deps.log("pix plan settlement: login link failed", input.purchaseId, e instanceof Error ? e.message : e);
    }
  }

  try {
    const contact = anonymous
      ? { email: row.buyer_email as string, fullName: row.buyer_name }
      : await deps.loadContact(userId);
    if (!contact) {
      deps.log("pix plan settlement: no contact for the receipt", input.purchaseId);
    } else {
      await deps.sendConfirmation({
        to: contact.email,
        fullName: contact.fullName,
        months: row.plan_months as number,
        credits: row.credits_granted,
        creditsNow: Number(result.credits_now),
        creditsLocked: Number(result.credits_locked),
        unlockAt: result.unlock_at ? new Date(String(result.unlock_at)) : null,
        periodEnd: new Date(String(result.period_end)),
        amountBrl: Number(row.amount_brl),
        paidAt: input.now ?? new Date(),
        termsVersion: row.terms_version,
        appUrl: input.appUrl,
      });
    }
  } catch (e) {
    deps.log("pix plan settlement: receipt failed", input.purchaseId, e instanceof Error ? e.message : e);
  }

  return { granted: true, userId, accountCreated: created };
}

export async function settleRefundedPlan(
  input: { purchaseId: string; paymentId: string },
  deps: { refund(purchaseId: string, paymentId: string): Promise<Record<string, unknown>> },
): Promise<{ refunded: boolean; creditsRemoved: number }> {
  const result = await deps.refund(input.purchaseId, input.paymentId);
  return { refunded: result.refunded === true, creditsRemoved: Number(result.credits_removed ?? 0) };
}

export type PublicPlanStatus = "pending" | "approved" | "failed";

/** What the paying screen polls for. Never says anything about another kind of purchase. */
export function publicPlanStatus(row: { kind: string; status: string } | null): PublicPlanStatus | null {
  if (!row || row.kind !== "plan") return null;
  if (row.status === "pending") return "pending";
  if (row.status === "approved") return "approved";
  return "failed";
}

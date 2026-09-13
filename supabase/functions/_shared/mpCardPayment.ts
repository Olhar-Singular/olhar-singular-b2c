// Pure builders for the Mercado Pago card rail (Card Payment Brick in the
// browser, POST /v1/payments on the server), isolated from the HTTP handler so
// the money-critical shaping is unit-tested without a live MP call.
//
// The Brick tokenizes the card client-side and hands us a formData; nothing
// here ever sees a PAN. The amount is taken from the package row, never from
// the request, and instalments are pinned to 1 (product decision).

import type { CreditPackage } from "./creditPackages.ts";

/** What the Card Payment Brick's onSubmit gives the client, as we accept it. */
export interface CardFormData {
  token: string;
  payment_method_id: string;
  issuer_id?: string;
  installments?: number;
  payer?: {
    email?: string;
    identification?: { type: string; number: string };
  };
}

export type ParsedCard =
  | { ok: true; card: CardFormData }
  | { ok: false; error: "invalid_card" | "installments_not_allowed" };

/** Printed on the buyer's card statement. MP caps it at 22 characters. */
export const CARD_STATEMENT_DESCRIPTOR = "OLHAR SINGULAR";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Validates the Brick payload. Only what the payment body needs is kept; a
// malformed identification is dropped rather than forwarded, since MP would
// reject the whole payment over it.
export function parseCardFormData(raw: unknown): ParsedCard {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "invalid_card" };
  const input = raw as Record<string, unknown>;

  if (!nonEmptyString(input.token) || !nonEmptyString(input.payment_method_id)) {
    return { ok: false, error: "invalid_card" };
  }
  if (input.installments !== undefined && input.installments !== 1) {
    return { ok: false, error: "installments_not_allowed" };
  }

  const card: CardFormData = {
    token: input.token,
    payment_method_id: input.payment_method_id,
  };
  if (input.issuer_id !== undefined && input.issuer_id !== null && input.issuer_id !== "") {
    card.issuer_id = String(input.issuer_id);
  }
  if (input.installments !== undefined) card.installments = 1;

  const payer = input.payer as Record<string, unknown> | undefined;
  if (payer && typeof payer === "object") {
    const out: CardFormData["payer"] = {};
    if (nonEmptyString(payer.email)) out.email = payer.email;
    const ident = payer.identification as Record<string, unknown> | undefined;
    if (ident && nonEmptyString(ident.type) && nonEmptyString(ident.number)) {
      out.identification = { type: ident.type, number: ident.number };
    }
    card.payer = out;
  }

  return { ok: true, card };
}

export interface CardPaymentInput {
  pkg: Pick<CreditPackage, "credits" | "amountBrl">;
  purchaseId: string;
  card: CardFormData;
  /** The account e-mail: the payer of record is the user, not what the Brick shows. */
  email: string;
  notificationUrl: string;
}

export function buildCardPaymentBody(input: CardPaymentInput): Record<string, unknown> {
  const { pkg, purchaseId, card, email, notificationUrl } = input;
  const payer: Record<string, unknown> = { email };
  if (card.payer?.identification) payer.identification = card.payer.identification;

  return {
    // In reais, not cents: /v1/payments takes the decimal amount.
    transaction_amount: pkg.amountBrl,
    token: card.token,
    // Regular hyphen, not an em dash, per project pt-BR punctuation.
    description: `${pkg.credits} ${pkg.credits === 1 ? "crédito" : "créditos"} - Olhar Singular`,
    installments: 1,
    payment_method_id: card.payment_method_id,
    ...(card.issuer_id ? { issuer_id: card.issuer_id } : {}),
    payer,
    external_reference: purchaseId,
    notification_url: notificationUrl,
    statement_descriptor: CARD_STATEMENT_DESCRIPTOR,
    // approved or rejected, never in_process: the buyer gets an answer on the spot.
    binary_mode: true,
    metadata: { purchase_id: purchaseId },
  };
}

export type CardOutcome =
  | { status: "approved"; paymentId: string }
  | { status: "rejected"; paymentId: string | null; statusDetail: string }
  | { status: "pending"; paymentId: string | null; statusDetail: string | null };

interface MpPaymentLike {
  id?: string | number;
  status?: string;
  status_detail?: string;
}

const REJECTED_STATUSES = ["rejected", "cancelled"];

// What the MP answer means for the purchase. Unknown statuses are left pending
// for the webhook to settle; they are never treated as approved.
export function interpretCardPayment(payment: MpPaymentLike): CardOutcome {
  const paymentId =
    payment.id === undefined || payment.id === null || payment.id === "" ? null : String(payment.id);

  if (payment.status === "approved" && paymentId) {
    return { status: "approved", paymentId };
  }
  if (REJECTED_STATUSES.includes(payment.status ?? "")) {
    return { status: "rejected", paymentId, statusDetail: payment.status_detail ?? "unknown" };
  }
  return { status: "pending", paymentId, statusDetail: payment.status_detail ?? null };
}

// For logs only: the card token and the payer block (e-mail, CPF) never reach
// console output, whatever shape MP used (/v1/payments or /preapproval, whose
// error bodies can echo the request). Returns a shallow copy.
const SENSITIVE_KEYS = ["token", "payer", "payer_email", "card_token_id", "card", "external_reference_payer"];

export function maskPayer<T extends Record<string, unknown>>(body: T): T {
  const masked: Record<string, unknown> = { ...body };
  for (const key of SENSITIVE_KEYS) {
    if (key in masked) masked[key] = "[redacted]";
  }
  return masked as T;
}

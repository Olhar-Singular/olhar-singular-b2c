// Pure builders for the Mercado Pago Checkout Transparente Pix rail
// (POST /v1/payments), isolated from the HTTP handler so they can be unit-tested
// without a live MP call. Unlike Checkout Pro, nothing here redirects: the QR
// code comes back in the response and is rendered inside our own page.

import type { CreditPackage } from "./creditPackages.ts";

export const PIX_EXPIRES_AFTER_SECONDS = 60 * 60;

export interface PixPaymentInput {
  pkg: CreditPackage;
  purchaseId: string;
  email?: string;
  notificationUrl: string;
  expiresInSeconds?: number;
  /** Reference clock, injected so the expiry is deterministic under test. */
  now?: Date;
}

// MP documents date_of_expiration as yyyy-MM-ddTHH:mm:ss.SSS±hh:mm and rejects a
// bare "Z", so the instant is written with an explicit offset. Brazil has no DST,
// so -03:00 is constant, and shifting the epoch keeps this independent of the
// server's local timezone.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function toMpDate(instant: Date): string {
  return `${new Date(instant.getTime() - BRT_OFFSET_MS).toISOString().slice(0, -1)}-03:00`;
}

export function buildPixPaymentBody(input: PixPaymentInput): Record<string, unknown> {
  const {
    pkg,
    purchaseId,
    email,
    notificationUrl,
    expiresInSeconds = PIX_EXPIRES_AFTER_SECONDS,
    now = new Date(),
  } = input;

  return {
    // In reais, not cents: /v1/payments takes the decimal amount.
    transaction_amount: pkg.amountBrl,
    // Regular hyphen, not an em dash, per project pt-BR punctuation.
    description: `${pkg.credits} ${pkg.credits === 1 ? "crédito" : "créditos"} - Olhar Singular`,
    payment_method_id: "pix",
    external_reference: purchaseId,
    notification_url: notificationUrl,
    date_of_expiration: toMpDate(new Date(now.getTime() + expiresInSeconds * 1000)),
    ...(email ? { payer: { email } } : {}),
  };
}

export interface PixQr {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
}

interface MpPixPayment {
  id?: string | number;
  status?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    } | null;
  } | null;
}

// Pulls the payable bits out of a created Pix payment. Returns null when MP
// answered without a usable code — the caller must fail loudly instead of
// showing an empty QR dialog. The image is optional: the copy-and-paste code is
// what actually pays, so a missing PNG only costs the scan shortcut.
export function extractPixQr(payment: MpPixPayment): PixQr | null {
  const data = payment.point_of_interaction?.transaction_data;
  if (!data?.qr_code) return null;
  if (payment.id === undefined || payment.id === null || payment.id === "") return null;

  return {
    paymentId: String(payment.id),
    status: payment.status ?? "pending",
    qrCode: data.qr_code,
    qrCodeBase64: data.qr_code_base64 ?? "",
    ticketUrl: data.ticket_url,
  };
}

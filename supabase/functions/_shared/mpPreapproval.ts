// Pure builders for the Mercado Pago subscription rail (Assinaturas /
// preapproval), isolated from the HTTP handlers so the money-critical shaping
// is unit-tested without a live MP call.
//
// The card is tokenized by the Card Payment Brick in the browser; the server
// creates the preapproval with that token. The amount comes from the plan row,
// never from the request. There is no statement_descriptor on /preapproval:
// the invoice name is configured on the MP account (deploy runbook).

export interface PlanLike {
  id: string;
  slug: string;
  name: string;
  priceBrl: number;
  monthlyCredits: number;
  adminOnly: boolean;
}

/** Days of the trial with card (spec 2026-09-15, decision 1). */
export const TRIAL_DAYS = 7;

/** MP rejects a longer reason with 400 "reason has more than 60 characters". */
export const PREAPPROVAL_REASON_MAX = 60;

// The first charge of a trial: now + 7 days. Whole seconds: MP echoes the value
// back as next_payment_date and the row stores it as the period end.
export function trialEndDate(now: Date): Date {
  const end = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  end.setUTCMilliseconds(0);
  return end;
}

export interface PreapprovalInput {
  plan: PlanLike;
  /** subscriptions.id, sent as external_reference so webhooks find the row. */
  subscriptionId: string;
  /** The account e-mail, not whatever the Brick showed. */
  payerEmail: string;
  cardToken: string;
  backUrl: string;
  /** ISO date of the first charge (trial with card). Omitted = MP charges now. */
  startDate?: string;
}

export function buildPreapprovalBody(input: PreapprovalInput): Record<string, unknown> {
  // Regular hyphen, not an em dash, per project pt-BR punctuation.
  const reason = input.startDate
    ? `Teste ${TRIAL_DAYS} dias + ${input.plan.name} - Olhar Singular`
    : `Assinatura ${input.plan.name} - Olhar Singular`;
  return {
    reason: reason.slice(0, PREAPPROVAL_REASON_MAX),
    external_reference: input.subscriptionId,
    payer_email: input.payerEmail,
    card_token_id: input.cardToken,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: input.plan.priceBrl,
      currency_id: "BRL",
      ...(input.startDate ? { start_date: input.startDate } : {}),
    },
    back_url: input.backUrl,
    status: "authorized",
  };
}

export interface PreapprovalOutcome {
  status: "authorized" | "pending" | "rejected";
  preapprovalId: string | null;
  mpStatus: string | null;
  nextPaymentDate: string | null;
  cardBrand: string | null;
  statusDetail: string | null;
}

interface PreapprovalLike {
  id?: string | number;
  status?: string | number;
  next_payment_date?: string;
  payment_method_id?: string;
  reason?: string;
  message?: string;
}

// authorized → we can load the plan now; pending → the card is still being
// validated, the webhook will activate; anything else → rejected.
export function interpretPreapproval(resp: PreapprovalLike): PreapprovalOutcome {
  const preapprovalId =
    resp.id === undefined || resp.id === null || resp.id === "" ? null : String(resp.id);
  const mpStatus = typeof resp.status === "string" ? resp.status : null;
  const base = {
    preapprovalId,
    mpStatus,
    nextPaymentDate: resp.next_payment_date ?? null,
    cardBrand: resp.payment_method_id ?? null,
  };

  if (preapprovalId && mpStatus === "authorized") return { ...base, status: "authorized", statusDetail: null };
  if (preapprovalId && mpStatus === "pending") return { ...base, status: "pending", statusDetail: null };
  return {
    ...base,
    status: "rejected",
    statusDetail: resp.message ?? mpStatus ?? "unknown",
  };
}

export type WebhookTopic = "payment" | "subscription_preapproval" | "subscription_authorized_payment";

const TOPICS: readonly WebhookTopic[] = ["payment", "subscription_preapproval", "subscription_authorized_payment"];

interface NotificationLike {
  type?: string;
  data?: { id?: string | number } | null;
}

// MP puts the id in the body AND as the query param data.id. Only the three
// topics above carry something we act on.
export function parseSubscriptionNotification(
  body: NotificationLike | null,
  queryId: string | null,
): { topic: WebhookTopic | null; id: string | null } {
  const type = body?.type;
  if (!TOPICS.includes(type as WebhookTopic)) return { topic: null, id: null };
  const raw = body?.data?.id;
  const id = raw === undefined || raw === null || raw === "" ? queryId : String(raw);
  if (!id) return { topic: null, id: null };
  return { topic: type as WebhookTopic, id };
}

export interface AuthorizedPaymentLike {
  id?: string | number;
  preapproval_id?: string | null;
  external_reference?: string | null;
  status?: string;
  debit_date?: string;
  retry_attempt?: number;
  transaction_amount?: number;
  payment?: { id?: string | number; status?: string; status_detail?: string } | null;
}

export interface InvoiceForRpc {
  id: string;
  mp_payment_id: string | null;
  status: string | null;
  payment_status: string;
  amount_brl: number | null;
  debit_date: string | null;
  retry_attempt: number | null;
  raw: Record<string, unknown>;
}

// Shapes GET /authorized_payments/{id} into the jsonb renew_subscription takes.
// Only payment.status === "approved" is money: "processed" alone means MP
// finished trying (possibly unsuccessfully), and "recycling" means it is still
// retrying.
export function interpretAuthorizedPayment(
  ap: AuthorizedPaymentLike,
): { subscriptionId: string | null; preapprovalId: string | null; invoice: InvoiceForRpc } | null {
  if (ap.id === undefined || ap.id === null || ap.id === "") return null;
  const subscriptionId = ap.external_reference ?? null;
  const preapprovalId = ap.preapproval_id ?? null;
  if (!subscriptionId && !preapprovalId) return null;

  const paymentStatus = ap.payment?.status ?? "pending";
  const paymentId =
    ap.payment?.id === undefined || ap.payment?.id === null ? null : String(ap.payment.id);

  return {
    subscriptionId,
    preapprovalId,
    invoice: {
      id: String(ap.id),
      mp_payment_id: paymentId,
      status: ap.status ?? null,
      payment_status: paymentStatus,
      amount_brl: ap.transaction_amount ?? null,
      debit_date: ap.debit_date ?? null,
      retry_attempt: ap.retry_attempt ?? null,
      // Keep a compact trace; never the payer block.
      raw: {
        id: ap.id,
        status: ap.status,
        payment_status: paymentStatus,
        status_detail: ap.payment?.status_detail,
      },
    },
  };
}

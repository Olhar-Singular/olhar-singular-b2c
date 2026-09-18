import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { CardFormDataView } from "@/hooks/useCredits";
import { parseInvokeError, parseInvokeFailure, parseEdgeFnError } from "@/lib/utils/errors";
import { formatBrl } from "@/lib/domain/subscriptionUi";

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/** A monthly plan as the pages render it. */
export interface PlanView {
  id: string;
  slug: string;
  name: string;
  priceBrl: number;
  monthlyCredits: number;
  highlight: boolean;
  adminOnly: boolean;
}

// PostgREST serializes numeric columns as strings in some paths; normalize once.
export function toPlanView(
  row: Pick<PlanRow, "id" | "slug" | "name" | "price_brl" | "monthly_credits" | "highlight" | "admin_only">,
): PlanView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceBrl: Number(row.price_brl),
    monthlyCredits: row.monthly_credits,
    highlight: row.highlight,
    adminOnly: row.admin_only,
  };
}

// The catalogue is public (the landing page reads it anonymously); RLS hides
// inactive plans and shows the admin-only R$1 smoke plan only to super-admins.
export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, slug, name, price_brl, monthly_credits, highlight, admin_only, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toPlanView);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export type SubscriptionStatus =
  | "pending"
  | "authorized"
  | "past_due"
  | "paused"
  | "cancelled"
  | "rejected";

/** The owner's most recent subscription joined with its plan. */
export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  statusDetail: string | null;
  plan: PlanView | null;
  nextPaymentDate: Date | null;
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  firstPaymentConfirmed: boolean;
  /** Trial with card: when MP collects the first charge. Null for a paid-from-day-one row. */
  trialEndsAt: Date | null;
  createdAt: Date | null;
}

const LIVE: readonly SubscriptionStatus[] = ["authorized", "past_due", "paused"];

export function isLiveSubscription(sub: SubscriptionView | null | undefined): boolean {
  return !!sub && LIVE.includes(sub.status);
}

function dateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

type SubscriptionWithPlan = SubscriptionRow & { plans: PlanRow | null };

export function toSubscriptionView(row: SubscriptionWithPlan): SubscriptionView {
  return {
    id: row.id,
    status: row.status as SubscriptionStatus,
    statusDetail: row.status_detail,
    plan: row.plans ? toPlanView(row.plans) : null,
    nextPaymentDate: dateOrNull(row.next_payment_date),
    currentPeriodEnd: dateOrNull(row.current_period_end),
    cancelledAt: dateOrNull(row.cancelled_at),
    cardBrand: row.card_brand,
    cardLastFour: row.card_last_four,
    firstPaymentConfirmed: row.first_payment_confirmed,
    trialEndsAt: dateOrNull(row.trial_ends_at),
    createdAt: dateOrNull(row.created_at),
  };
}

// One live subscription per user is enforced by the database; the most recent
// row is therefore either the live one or the last attempt (rejected/cancelled),
// which the card still wants to show ("vale até dd/mm", "cartão recusado").
export function useSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toSubscriptionView(data as SubscriptionWithPlan) : null;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

export interface SubscribeResult {
  status: "authorized" | "pending" | "rejected";
  subscriptionId: string;
  statusDetail?: string;
  message?: string;
  /** True when the checkout created the account (anonymous funnel). */
  accountCreated?: boolean;
  /** Trial with card: ISO date of the first charge. */
  trialEndsAt?: string | null;
}

/** Account block of the anonymous checkout. */
export interface SubscribeAccountInput {
  fullName: string;
  email: string;
  termsVersion: string;
}

export interface SubscribeInput {
  planSlug: string;
  card: CardFormDataView;
  cardLastFour?: string | null;
  account?: SubscribeAccountInput;
  attribution?: Record<string, unknown>;
  /** Trial with card (anonymous funnel only): the server picks the cheapest plan. */
  trial?: boolean;
}

// Every subscription mutation moves plan credits and the subscription row on
// the server; the client only has to catch up.
function useSubscriptionRefresh() {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  return () => {
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["credit_transactions"] });
  };
}

const SUBSCRIBE_FALLBACK = "Não foi possível concluir a assinatura. Tente novamente.";

/** The backend's code on a subscribe refusal (e.g. "trial_used"), null otherwise. */
export function subscribeErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

// A declined card comes back as status "rejected" with a pt-BR message, not as
// an error; business refusals (exempt, already subscribed, email_exists, rate
// limit) are errors. Anonymous callers pass `account`; the page then asks for
// the login link by e-mail (no session comes from the checkout).
export function useSubscribe() {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async (input: SubscribeInput) => {
      const { data, error } = await supabase.functions.invoke("subscribe", { body: input });
      if (error) {
        const failure = await parseInvokeFailure(error, SUBSCRIBE_FALLBACK);
        throw Object.assign(new Error(failure.message), { code: failure.code });
      }
      return data as SubscribeResult;
    },
    onSuccess: refresh,
    // trial_used is answered inline by the page (same card, paid plan, one click).
    onError: (err: Error) => {
      if (subscribeErrorCode(err) !== "trial_used") toast.error(parseEdgeFnError(err, SUBSCRIBE_FALLBACK));
    },
  });
}

const PASSWORD_FALLBACK = "Não foi possível definir a senha. Tente de novo.";

// First access of an account born from a payment. The server clears
// must_set_password; refreshProfile lets ProtectedRoute release the user.
export function useSetInitialPassword() {
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: { password: string }) => {
      const { data, error } = await supabase.functions.invoke("set-initial-password", { body: input });
      if (error) throw new Error(await parseInvokeError(error, PASSWORD_FALLBACK));
      return data as { ok: true; flagCleared?: boolean };
    },
    onSuccess: (data) => {
      refreshProfile();
      // The password is saved even when the flag could not be cleared right away.
      if (data.flagCleared === false) toast.warning("Senha salva. Se a tela voltar a pedir a senha, recarregue a página em alguns instantes.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, PASSWORD_FALLBACK)),
  });
}

const CANCEL_FALLBACK = "Não foi possível cancelar agora. Tente de novo em alguns minutos.";

// `trial`: cancelling inside the trial removes the trial credits at once, so the
// confirmation must not promise them until the period end.
export function useCancelSubscription({ trial = false }: { trial?: boolean } = {}) {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", { body: {} });
      if (error) throw new Error(await parseInvokeError(error, CANCEL_FALLBACK));
      return data as { status: "cancelled"; subscriptionId: string };
    },
    onSuccess: () => {
      refresh();
      toast.success(trial ? "Teste cancelado. Nada foi cobrado." : "Assinatura cancelada. Seus créditos valem até o fim do período pago.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, CANCEL_FALLBACK)),
  });
}

const CARD_FALLBACK = "O cartão não foi aceito. Tente outro cartão.";

// `toastErrors: false` when the caller shows the refusal inline (the card
// dialog), so the user does not read the same message twice.
export function useUpdateSubscriptionCard({ toastErrors = true }: { toastErrors?: boolean } = {}) {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async (input: { card: CardFormDataView; cardLastFour?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("update-subscription-card", { body: input });
      if (error) throw new Error(await parseInvokeError(error, CARD_FALLBACK));
      return data as { status: "updated"; subscriptionId: string };
    },
    onSuccess: () => {
      refresh();
      toast.success("Cartão atualizado. A próxima cobrança será feita nele.");
    },
    onError: (err: Error) => {
      if (toastErrors) toast.error(parseEdgeFnError(err, CARD_FALLBACK));
    },
  });
}

/** The newest approved charge with money of a subscription. */
export interface LastChargeView {
  id: string;
  amountBrl: number | null;
  debitDate: Date | null;
  refundedAt: Date | null;
}

type SubscriptionInvoiceRow = Database["public"]["Tables"]["subscription_invoices"]["Row"];

export function toLastChargeView(
  row: Pick<SubscriptionInvoiceRow, "id" | "amount_brl" | "debit_date" | "refunded_at">,
): LastChargeView {
  return {
    id: row.id,
    amountBrl: row.amount_brl === null ? null : Number(row.amount_brl),
    debitDate: dateOrNull(row.debit_date),
    refundedAt: dateOrNull(row.refunded_at),
  };
}

/** The newest approved charge with money of a subscription (owner RLS); null when none. */
export function useLastCharge(subscriptionId: string | null | undefined) {
  return useQuery({
    queryKey: ["last_charge", subscriptionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("id, amount_brl, debit_date, refunded_at")
        .eq("subscription_id", subscriptionId!)
        .eq("payment_status", "approved")
        .not("mp_payment_id", "is", null)
        .order("debit_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toLastChargeView(data) : null;
    },
    enabled: !!subscriptionId,
    staleTime: 1000 * 30,
  });
}

export interface RefundLastChargeResult {
  amountBrl: number;
  refundedAt: string;
  subscriptionId: string;
}

const REFUND_FALLBACK = "Não foi possível estornar agora. Tente de novo em alguns minutos.";

// Self-service refund of the last charge: the server refunds at Mercado Pago,
// removes the remaining plan credits of that charge and cancels the
// subscription. The client only has to catch up (same pattern as cancel).
export function useRefundLastCharge() {
  const refresh = useSubscriptionRefresh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("refund-last-charge", { body: {} });
      if (error) throw new Error(await parseInvokeError(error, REFUND_FALLBACK));
      return data as RefundLastChargeResult;
    },
    onSuccess: (data) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["last_charge"] });
      toast.success(`Estorno de ${formatBrl(data.amountBrl)} solicitado. Ele aparece no cartão em até duas faturas.`);
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, REFUND_FALLBACK)),
  });
}

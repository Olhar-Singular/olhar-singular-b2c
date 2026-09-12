import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import type { CardFormDataView } from "@/hooks/useCredits";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";

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

// A declined card comes back as status "rejected" with a pt-BR message, not as
// an error; business refusals (exempt, already subscribed) are errors.
export function useSubscribe() {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async (input: { planSlug: string; card: CardFormDataView; cardLastFour?: string | null }) => {
      const { data, error } = await supabase.functions.invoke("subscribe", { body: input });
      if (error) throw new Error(await parseInvokeError(error, SUBSCRIBE_FALLBACK));
      return data as SubscribeResult;
    },
    onSuccess: refresh,
    onError: (err: Error) => toast.error(parseEdgeFnError(err, SUBSCRIBE_FALLBACK)),
  });
}

const CANCEL_FALLBACK = "Não foi possível cancelar agora. Tente de novo em alguns minutos.";

export function useCancelSubscription() {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", { body: {} });
      if (error) throw new Error(await parseInvokeError(error, CANCEL_FALLBACK));
      return data as { status: "cancelled"; subscriptionId: string };
    },
    onSuccess: () => {
      refresh();
      toast.success("Assinatura cancelada. Seus créditos valem até o fim do período pago.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, CANCEL_FALLBACK)),
  });
}

const CARD_FALLBACK = "O cartão não foi aceito. Tente outro cartão.";

export function useUpdateSubscriptionCard() {
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
    onError: (err: Error) => toast.error(parseEdgeFnError(err, CARD_FALLBACK)),
  });
}

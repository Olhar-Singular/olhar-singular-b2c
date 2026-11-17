import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseInvokeFailure } from "@/lib/utils/errors";
import { activePrepaid, toPrepaidPlanView, type PrepaidPurchaseRow } from "@/lib/domain/prepaid";

// Pix prepaid plans (spec 2026-11-15-checkout-pix-a-vista): the catalogue, the
// QR of a plan, the public status the QR screen polls and the running plan the
// Créditos area shows.

export function usePrepaidPlans() {
  return useQuery({
    queryKey: ["prepaid_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prepaid_plans")
        .select("id, slug, months, credits, price_brl, highlight, admin_only, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toPrepaidPlanView);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export interface PixPlanCheckout {
  purchaseId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  /** ISO: the QR stops being payable after it. */
  expiresAt: string;
  amountBrl: number;
  credits: number;
  months: number;
}

export interface CreatePixPlanInput {
  planSlug: string;
  /** Anonymous buyers only: the account is born when the payment is confirmed. */
  account?: { fullName: string; email: string; termsVersion: string };
}

const PIX_PLAN_FALLBACK = "Erro ao gerar o Pix. Tente novamente.";

// Errors carry the server's pt-BR message and its code (email_exists,
// already_subscribed...): the payment block shows them inline, no toast.
export function useCreatePixPlan() {
  return useMutation({
    mutationFn: async (input: CreatePixPlanInput) => {
      const { data, error } = await supabase.functions.invoke("pix-plan-checkout", { body: input });
      if (error) {
        const failure = await parseInvokeFailure(error, PIX_PLAN_FALLBACK);
        throw Object.assign(new Error(failure.message), { code: failure.code });
      }
      return data as PixPlanCheckout;
    },
  });
}

export const PIX_PLAN_POLL_INTERVAL_MS = 3000;

type ServerPlanStatus = "pending" | "approved" | "failed";
export type PixPlanStatus = "idle" | ServerPlanStatus | "expired";

export function pixPlanPollInterval(status: string | undefined, expiresAt: string): number | false {
  if (status === "approved" || status === "failed") return false;
  return Date.now() < Date.parse(expiresAt) ? PIX_PLAN_POLL_INTERVAL_MS : false;
}

// An anonymous buyer has no session to read credit_purchases through RLS, so
// the QR screen asks pix-plan-status (R5). A failed read keeps it pending: the
// next poll retries. Past the expiry a still-pending QR reads as expired.
export function usePixPlanStatus(purchaseId: string | null, expiresAt: string | null): PixPlanStatus {
  const query = useQuery({
    queryKey: ["pix_plan_status", purchaseId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pix-plan-status", { body: { purchaseId } });
      if (error) return "pending" as const;
      return (data as { status: ServerPlanStatus }).status;
    },
    enabled: !!purchaseId,
    refetchInterval: (q) => pixPlanPollInterval(q.state.data, expiresAt as string),
    staleTime: 0,
  });

  if (!purchaseId) return "idle";
  const status = query.data;
  if (status === "approved" || status === "failed") return status;
  return expiresAt && Date.now() >= Date.parse(expiresAt) ? "expired" : "pending";
}

export function useActivePrepaid() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["active_prepaid", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_purchases")
        .select("plan_period_end, plan_locked_credits, plan_unlock_at, plan_released_at")
        .eq("user_id", user!.id)
        .eq("kind", "plan")
        .eq("status", "approved")
        .gt("plan_period_end", new Date().toISOString());
      if (error) throw error;
      return activePrepaid((data ?? []) as PrepaidPurchaseRow[], new Date());
    },
    enabled: !!user,
  });
}

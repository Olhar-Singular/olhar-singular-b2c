import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";

type CreditTransaction = Database["public"]["Tables"]["credit_transactions"]["Row"];

export function useTransactionHistory(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["credit_transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as CreditTransaction[];
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

interface CheckoutInput {
  credits: number;
  amountBrl: number;
  method?: "card" | "pix";
}

// Hosted Stripe Checkout for the card rail. `method` still exists on the input
// so the button can pass "card"; Pix is served by Mercado Pago
// (useCreatePixPayment), inline, with no redirect.
export function useCreateStripeCheckout() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
        body: input,
      });
      if (error) {
        const msg = await parseInvokeError(error, "Erro ao iniciar compra. Tente novamente.");
        throw new Error(msg);
      }
      return data as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao iniciar compra. Tente novamente.")),
  });
}

export interface PixPayment {
  qrCode: string;
  qrCodeBase64: string;
  purchaseId: string;
  ticketUrl?: string;
}

// Pix via Mercado Pago Checkout Transparente: the QR code comes back in the
// response and is rendered inside our own page, so the buyer never leaves the
// app and never needs an MP login. The balance only moves when the mp-webhook
// confirms the payment (watched by usePixPurchaseStatus).
export function useCreatePixPayment() {
  return useMutation({
    mutationFn: async (input: { credits: number; amountBrl: number }) => {
      const { data, error } = await supabase.functions.invoke("create-pix-payment", {
        body: input,
      });
      if (error) {
        const msg = await parseInvokeError(error, "Erro ao gerar o Pix. Tente novamente.");
        throw new Error(msg);
      }
      return data as PixPayment;
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, "Erro ao gerar o Pix. Tente novamente.")),
  });
}

export const PIX_POLL_INTERVAL_MS = 3000;

const PIX_SETTLED = ["approved", "rejected", "cancelled"];

// Pix confirmation is asynchronous: nothing happens on the client until the
// webhook writes the purchase row, so the dialog polls until the status settles.
export function pixPollInterval(status?: string): number | false {
  return PIX_SETTLED.includes(status ?? "") ? false : PIX_POLL_INTERVAL_MS;
}

// Watches the pending purchase created by create-pix-payment. Owner-based RLS
// lets the buyer read its own credit_purchases row.
export function usePixPurchaseStatus(purchaseId: string | null) {
  return useQuery({
    queryKey: ["credit_purchase", purchaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_purchases")
        .select("status")
        .eq("id", purchaseId!)
        .maybeSingle();
      if (error) throw error;
      return data as { status: string } | null;
    },
    enabled: !!purchaseId,
    refetchInterval: (query) => pixPollInterval(query.state.data?.status),
    staleTime: 0,
  });
}

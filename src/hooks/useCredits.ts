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
// so the button can pass "card"; Pix is served by Mercado Pago (useCreateCheckout).
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

// Pix via Mercado Pago (hosted Checkout Pro, card excluded). Redirects to the MP
// page; the balance only moves when the mp-webhook confirms the payment.
export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (input: { credits: number; amountBrl: number }) => {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
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

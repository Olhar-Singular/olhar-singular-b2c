import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

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
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: input,
      });
      if (error) throw error;
      return data as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { parseInvokeError, parseEdgeFnError } from "@/lib/utils/errors";

type CreditTransaction = Database["public"]["Tables"]["credit_transactions"]["Row"];
type CreditPackageRow = Database["public"]["Tables"]["credit_packages"]["Row"];

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

/** An extra-credit package as the page renders it. */
export interface CreditPackageView {
  id: string;
  credits: number;
  amountBrl: number;
  label: string;
  highlight: boolean;
  adminOnly: boolean;
}

// PostgREST serializes numeric columns as strings in some paths; normalize once.
export function toPackageView(row: Pick<CreditPackageRow, "id" | "credits" | "price_brl" | "label" | "highlight" | "admin_only">): CreditPackageView {
  return {
    id: row.id,
    credits: row.credits,
    amountBrl: Number(row.price_brl),
    label: row.label,
    highlight: row.highlight,
    adminOnly: row.admin_only,
  };
}

// The catalogue lives in credit_packages; RLS already hides inactive rows and
// shows the admin-only smoke package only to super-admins, so the page never
// needs to special-case it.
export function usePackages() {
  return useQuery({
    queryKey: ["credit_packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packages")
        .select("id, credits, price_brl, label, highlight, admin_only, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toPackageView);
    },
    staleTime: 1000 * 60 * 5,
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
// confirms the payment (watched by usePurchaseStatus).
export function useCreatePixPayment() {
  return useMutation({
    mutationFn: async (input: { packageId: string }) => {
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

/** The Card Payment Brick formData, as the checkout forwards it. */
export interface CardFormDataView {
  token: string;
  payment_method_id: string;
  issuer_id?: string;
  installments?: number;
  payer?: { email?: string; identification?: { type: string; number: string } };
}

export interface CardPaymentResult {
  status: "approved" | "rejected" | "pending";
  purchaseId: string;
  creditsGranted?: number;
  statusDetail?: string;
  message?: string;
}

// Card via Mercado Pago, inline: the Brick tokenized the card in the browser,
// create-card-payment charges it and answers on the spot. A declined card comes
// back as status "rejected" with a pt-BR message, not as an error.
export function useCreateCardPayment() {
  return useMutation({
    mutationFn: async (input: { packageId: string; card: CardFormDataView }) => {
      const { data, error } = await supabase.functions.invoke("create-card-payment", {
        body: input,
      });
      if (error) {
        const msg = await parseInvokeError(error, "Não foi possível processar o cartão. Tente novamente.");
        throw new Error(msg);
      }
      return data as CardPaymentResult;
    },
    onError: (err: Error) =>
      toast.error(parseEdgeFnError(err, "Não foi possível processar o cartão. Tente novamente.")),
  });
}

export const PURCHASE_POLL_INTERVAL_MS = 3000;

const PURCHASE_SETTLED = ["approved", "rejected", "cancelled"];

// Confirmation can be asynchronous (Pix always; card only when MP leaves it
// pending): nothing happens on the client until the webhook writes the purchase
// row, so the dialogs poll until the status settles.
export function purchasePollInterval(status?: string): number | false {
  return PURCHASE_SETTLED.includes(status ?? "") ? false : PURCHASE_POLL_INTERVAL_MS;
}

// Watches a pending purchase created by either checkout. Owner-based RLS lets
// the buyer read its own credit_purchases row.
export function usePurchaseStatus(purchaseId: string | null) {
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
    refetchInterval: (query) => purchasePollInterval(query.state.data?.status),
    staleTime: 0,
  });
}

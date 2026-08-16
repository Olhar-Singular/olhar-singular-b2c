import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePixPurchaseStatus } from "@/hooks/useCredits";
import type { PixPayment } from "@/hooks/useCredits";

interface Props {
  payment: PixPayment | null;
  onOpenChange: (open: boolean) => void;
}

// Checkout Transparente: the QR code lives here, inside the app. Nothing about
// this dialog navigates away, and the buyer needs no Mercado Pago account. The
// balance only moves when the mp-webhook approves the purchase, which is what
// the polled status watches for.
export default function PixPaymentDialog({ payment, onOpenChange }: Props) {
  const { refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const purchaseId = payment?.purchaseId ?? null;
  const { data } = usePixPurchaseStatus(purchaseId);
  const status = data?.status ?? "pending";

  // Credit lands on the server; the client only has to catch up once. Keyed by
  // purchase so a second Pix in the same session still refreshes.
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "approved") return;
    if (!purchaseId || refreshedFor.current === purchaseId) return;
    refreshedFor.current = purchaseId;
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["credit_transactions"] });
  }, [status, purchaseId, refreshProfile, queryClient]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(payment!.qrCode);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  return (
    <Dialog open={!!payment} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pague com Pix</DialogTitle>
          <DialogDescription>
            Escaneie o QR code no app do seu banco ou copie o código. Seus créditos entram
            sozinhos assim que o pagamento for confirmado.
          </DialogDescription>
        </DialogHeader>

        {payment && (
          <div className="space-y-4">
            {payment.qrCodeBase64 && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${payment.qrCodeBase64}`}
                  alt="QR code do Pix"
                  className="w-52 h-52 rounded-lg border border-border bg-white p-2"
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Pix copia e cola</p>
              <code className="block max-h-24 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed break-all text-foreground">
                {payment.qrCode}
              </code>
              <Button variant="outline" className="w-full gap-1.5" onClick={copyCode}>
                <Copy className="w-3.5 h-3.5" />
                Copiar código
              </Button>
            </div>

            {status === "approved" && (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 text-sm font-medium text-green-600"
              >
                <CheckCircle2 className="w-4 h-4" />
                Pagamento confirmado! Créditos adicionados.
              </p>
            )}

            {status === "pending" && (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando pagamento...
              </p>
            )}

            {status !== "approved" && status !== "pending" && (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 text-sm text-destructive"
              >
                <XCircle className="w-4 h-4" />
                O pagamento não foi concluído. Gere um novo Pix para tentar de novo.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

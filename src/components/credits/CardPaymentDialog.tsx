import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import MpCardBrick from "@/components/payments/MpCardBrick";
import { useAuth } from "@/hooks/useAuth";
import { useCreateCardPayment, usePurchaseStatus } from "@/hooks/useCredits";
import type { CardFormDataView, CreditPackageView } from "@/hooks/useCredits";
import { trackPurchase } from "@/lib/analytics/events";

interface Props {
  pkg: CreditPackageView | null;
  onOpenChange: (open: boolean) => void;
}

type Stage =
  | { kind: "form"; error?: string }
  | { kind: "approved" }
  | { kind: "rejected"; message: string }
  | { kind: "pending"; purchaseId: string };

const GENERIC_REJECTION = "O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.";

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Card checkout inside the app: the Card Payment Brick tokenizes the card,
// create-card-payment charges it and answers on the spot. Nothing here
// navigates away. A declined card shows MP's reason and lets the buyer try
// another card; the rare "pending" answer is polled like the Pix dialog.
export default function CardPaymentDialog({ pkg, onOpenChange }: Props) {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const payment = useCreateCardPayment();
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  // Forces a fresh Brick after a rejection: the previous token was single-use.
  const [attempt, setAttempt] = useState(0);

  const pendingId = stage.kind === "pending" ? stage.purchaseId : null;
  const { data: polled } = usePurchaseStatus(pendingId);

  // Reset when the dialog closes so the next package starts on the form.
  useEffect(() => {
    if (!pkg) setStage({ kind: "form" });
  }, [pkg]);

  // Credit lands on the server; the client only has to catch up once.
  function settleApproved() {
    setStage({ kind: "approved" });
    refreshProfile();
    queryClient.invalidateQueries({ queryKey: ["credit_transactions"] });
  }

  // Leaving "pending" happens exactly once per purchase: the stage change below
  // stops this effect from firing again for the same polled status.
  useEffect(() => {
    if (stage.kind !== "pending" || !polled) return;
    if (polled.status === "approved") {
      settleApproved();
    } else if (polled.status === "rejected" || polled.status === "cancelled") {
      setStage({ kind: "rejected", message: GENERIC_REJECTION });
    }
    // settleApproved only touches stable context values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polled, stage]);

  async function handleSubmit(current: CreditPackageView, card: CardFormDataView) {
    const result = await payment.mutateAsync({ packageId: current.id, card });
    if (result.status === "approved") {
      trackPurchase(current, result.purchaseId);
      settleApproved();
    } else if (result.status === "rejected") {
      setStage({ kind: "rejected", message: result.message ?? GENERIC_REJECTION });
    } else {
      setStage({ kind: "pending", purchaseId: result.purchaseId });
    }
  }

  function retry() {
    setAttempt((n) => n + 1);
    setStage({ kind: "form" });
  }

  return (
    <Dialog open={!!pkg} onOpenChange={onOpenChange}>
      {pkg && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pague com cartão</DialogTitle>
            <DialogDescription>
              {`${pkg.credits} ${pkg.credits === 1 ? "crédito" : "créditos"} por ${formatBrl(pkg.amountBrl)}, em 1x. Os créditos entram assim que o pagamento for aprovado.`}
            </DialogDescription>
          </DialogHeader>

          {stage.kind === "form" && (
            <div className="space-y-3">
              {stage.error && (
                <p role="alert" className="text-sm text-destructive">
                  {stage.error}
                </p>
              )}
              <MpCardBrick
                key={attempt}
                amount={pkg.amountBrl}
                payerEmail={user?.email ?? undefined}
                onSubmit={(card) => handleSubmit(pkg, card)}
                onError={(message) => setStage({ kind: "form", error: message })}
              />
            </div>
          )}

          {stage.kind === "approved" && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-2 text-sm font-medium text-green-600"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Pagamento aprovado! Créditos adicionados.
            </p>
          )}

          {stage.kind === "pending" && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Pagamento em análise. Seus créditos entram assim que for confirmado.
            </p>
          )}

          {stage.kind === "rejected" && (
            <div className="space-y-3">
              <p
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 text-sm text-destructive"
              >
                <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                {stage.message}
              </p>
              <Button variant="outline" className="w-full" onClick={retry}>
                Tentar com outro cartão
              </Button>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

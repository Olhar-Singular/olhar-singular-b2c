import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MpCardBrick from "@/components/payments/MpCardBrick";
import { useAuth } from "@/hooks/useAuth";
import type { Access } from "@/lib/domain/access";
import { canSubscribe, formatBrl, formatCard, formatDate, isCardTrial } from "@/lib/domain/subscriptionUi";
import type { CardFormDataView } from "@/hooks/useCredits";
import {
  isLiveSubscription,
  useCancelSubscription,
  useUpdateSubscriptionCard,
  type SubscriptionStatus,
  type SubscriptionView,
} from "@/hooks/useSubscription";

interface Props {
  subscription: SubscriptionView | null | undefined;
  access: Access | null;
  /** Super-admins see the card even on a courtesy account (smoke plan). */
  isSuperAdmin?: boolean;
}

const STATUS_LABELS: Record<SubscriptionStatus, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  authorized: { label: "Ativa", tone: "default" },
  past_due: { label: "Pagamento pendente", tone: "destructive" },
  paused: { label: "Pausada", tone: "secondary" },
  pending: { label: "Em análise", tone: "secondary" },
  cancelled: { label: "Cancelada", tone: "outline" },
  rejected: { label: "Cartão recusado", tone: "destructive" },
};

// "Sua assinatura" at the top of the credits page: what the account pays for,
// when the next charge lands, which card, and the two self-service actions
// (cancel with confirmation, change card with a fresh Brick). Courtesy accounts
// never see it; anyone else without a live subscription gets the CTA.
export default function SubscriptionCard({ subscription, access, isSuperAdmin = false }: Props) {
  const { user } = useAuth();
  // Hooks run before the early returns; isCardTrial is false while loading.
  const cardTrial = isCardTrial(subscription);
  const cancel = useCancelSubscription({ trial: cardTrial });
  // The dialog shows the refusal inline; no duplicate toast.
  const updateCard = useUpdateSubscriptionCard({ toastErrors: false });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  if (!canSubscribe(access, isSuperAdmin) || subscription === undefined) return null;

  const live = isLiveSubscription(subscription);

  if (!live) {
    const cancelledUntil =
      subscription?.status === "cancelled" && access.periodEnd && access.planCredits > 0 ? access.periodEnd : null;
    return (
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Sua assinatura</CardTitle>
            {subscription && <Badge variant={STATUS_LABELS[subscription.status].tone}>{STATUS_LABELS[subscription.status].label}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {cancelledUntil ? (
            <p className="text-sm text-muted-foreground">
              Seus créditos do plano valem até {formatDate(cancelledUntil)}. Depois disso, só os extras continuam.
            </p>
          ) : subscription?.status === "pending" ? (
            <p className="text-sm text-muted-foreground">
              Estamos confirmando o cartão com a operadora. Os créditos entram assim que a assinatura for aprovada.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Assine um plano mensal e receba créditos novos todo mês. Cancele quando quiser.
            </p>
          )}
          {subscription?.status !== "pending" && (
            <Link to="/assinar">
              <Button className="gap-1.5">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {subscription?.status === "rejected" ? "Tentar com outro cartão" : "Assinar um plano"}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  // Live from here on: the row exists and has a plan.
  const sub = subscription!;
  const status = cardTrial ? { label: "Teste grátis", tone: "default" as const } : STATUS_LABELS[sub.status];
  const card = formatCard(sub.cardBrand, sub.cardLastFour);

  // Rejecting hands the failure back to the Brick, which re-enables its
  // button for another try; the reason is shown inline above the Brick.
  async function handleNewCard(formData: CardFormDataView) {
    setCardError(null);
    try {
      await updateCard.mutateAsync({ card: formData, cardLastFour: null });
      setChangingCard(false);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "O cartão não foi aceito. Tente outro cartão.");
      throw e;
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Sua assinatura</CardTitle>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Plano</dt>
            <dd className="font-semibold">
              {cardTrial && sub.plan
                ? `Teste grátis · depois ${sub.plan.name} · ${formatBrl(sub.plan.priceBrl)}/mês`
                : sub.plan ? `${sub.plan.name} · ${formatBrl(sub.plan.priceBrl)}/mês` : "Plano"}
            </dd>
            {sub.plan && <dd className="text-xs text-muted-foreground">{sub.plan.monthlyCredits} créditos por mês</dd>}
          </div>
          <div>
            <dt className="text-muted-foreground">{cardTrial ? "Primeira cobrança" : "Próxima cobrança"}</dt>
            <dd className="font-semibold">
              {cardTrial && sub.trialEndsAt ? formatDate(sub.trialEndsAt) : sub.nextPaymentDate ? formatDate(sub.nextPaymentDate) : "a confirmar"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Cartão</dt>
            <dd className="font-semibold">{card ?? "não informado"}</dd>
          </div>
        </dl>

        {cardTrial && sub.trialEndsAt && (
          <p className="text-sm text-muted-foreground">
            Você tem {access.planCredits} {access.planCredits === 1 ? "crédito" : "créditos"} do teste até {formatDate(sub.trialEndsAt)}. Cancelar agora encerra o acesso na hora e nada é cobrado.
          </p>
        )}

        {sub.status === "past_due" && (
          <p role="alert" className="text-sm text-destructive">
            A última cobrança não foi aprovada. Troque o cartão para manter seus créditos no próximo mês.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setChangingCard(true)}>
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            Trocar cartão
          </Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmCancel(true)} disabled={cancel.isPending}>
            {cardTrial ? "Cancelar teste" : "Cancelar assinatura"}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cardTrial ? "Cancelar o teste?" : "Cancelar a assinatura?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {cardTrial ? (
                <>Nada será cobrado. Seus créditos do teste são removidos na hora; os extras não expiram.</>
              ) : (
                <>
                  Você não será mais cobrado. Seus créditos do plano continuam valendo até{" "}
                  {access.periodEnd ? formatDate(access.periodEnd) : "o fim do período pago"}; os extras não expiram.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cardTrial ? "Manter o teste" : "Manter assinatura"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>{cardTrial ? "Cancelar teste" : "Cancelar assinatura"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No trigger: every onOpenChange is a close gesture, which also clears the error. */}
      <Dialog open={changingCard} onOpenChange={(open) => { setChangingCard(open); setCardError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar o cartão</DialogTitle>
            <DialogDescription>
              O novo cartão passa a ser usado na próxima cobrança
              {sub.plan ? ` de ${formatBrl(sub.plan.priceBrl)}` : ""}. Nada é cobrado agora.
            </DialogDescription>
          </DialogHeader>
          {cardError && (
            <p role="alert" className="text-sm text-destructive">
              {cardError}
            </p>
          )}
          {changingCard && (
            <MpCardBrick
              amount={sub.plan?.priceBrl ?? 1}
              payerEmail={user?.email ?? undefined}
              onSubmit={handleNewCard}
              onError={setCardError}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Coins, TrendingUp, TrendingDown, CreditCard, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PixPaymentDialog from "@/components/credits/PixPaymentDialog";
import CardPaymentDialog from "@/components/credits/CardPaymentDialog";
import SubscriptionCard from "@/components/credits/SubscriptionCard";
import { useAccess } from "@/hooks/useAccess";
import { useAuth } from "@/hooks/useAuth";
import { maskCpfForOwner } from "@/lib/domain/subscriptionUi";
import { useSubscription } from "@/hooks/useSubscription";
import { useTransactionHistory, useCreatePixPayment, usePackages } from "@/hooks/useCredits";
import type { CreditPackageView, PixPayment } from "@/hooks/useCredits";

const TYPE_LABELS: Record<string, string> = {
  signup_bonus: "Bônus de cadastro",
  purchase: "Compra",
  adapt: "Adaptação",
  extract: "Extração de questões",
  regenerate: "Regeneração de questão",
  chat: "Chat com IA",
  refund: "Reembolso",
  admin_grant: "Crédito concedido",
  trial_grant: "Créditos do período de teste",
  plan_grant: "Créditos do plano",
  plan_reset: "Créditos do plano encerrados",
  compensation: "Compensação",
  clawback: "Estorno do plano",
};

function formatDate(value: Date) {
  return format(value, "dd/MM/yyyy", { locale: ptBR });
}

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CreditsPage() {
  const access = useAccess();
  const { profile } = useAuth();
  const cpfMasked = maskCpfForOwner(profile?.cpf);
  const { data: subscription } = useSubscription();
  const { data: transactions = [], isLoading } = useTransactionHistory();
  // The catalogue comes from credit_packages; RLS already hides inactive rows
  // and shows the admin-only R$1 smoke package only to super-admins.
  const { data: packages = [], isLoading: loadingPackages } = usePackages();
  const pixPayment = useCreatePixPayment();
  const [pix, setPix] = useState<PixPayment | null>(null);
  const [cardPkg, setCardPkg] = useState<CreditPackageView | null>(null);
  const buying = pixPayment.isPending;

  // Checkout Transparente: the QR code is rendered here, so a failed create must
  // leave the dialog closed instead of opening it empty (the hook already toasts).
  async function startPix(packageId: string) {
    try {
      setPix(await pixPayment.mutateAsync({ packageId }));
    } catch {
      setPix(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      {/* Balance hero */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Coins className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Seu saldo atual</p>
              <p className="text-4xl font-bold text-foreground tabular-nums">
                {access ? access.total : "..."}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {access?.unlimited ? "conta com cortesia: sem débito" : "créditos disponíveis"}
              </p>
              {cpfMasked && (
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  CPF do titular do cartão: {cpfMasked}
                </p>
              )}
            </div>
          </div>
          {access && !access.unlimited && (
            <dl className="text-right text-sm space-y-1">
              <div>
                <dt className="text-muted-foreground inline">
                  {access.kind === "trial" ? "Teste" : "Plano"}
                  {access.periodEnd && access.planCredits > 0 ? ` até ${formatDate(access.periodEnd)}` : ""}:{" "}
                </dt>
                <dd className="inline font-semibold tabular-nums">{access.planCredits}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground inline">Extras (não expiram): </dt>
                <dd className="inline font-semibold tabular-nums">{access.extraCredits}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Subscription (hidden for courtesy accounts and while loading) */}
      <SubscriptionCard subscription={subscription} access={access} isSuperAdmin={!!profile?.is_super_admin} />

      {/* Packages */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Comprar créditos extras</h2>

        {loadingPackages && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="packages-loading">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        )}

        {!loadingPackages && packages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum pacote disponível no momento.
          </p>
        )}

        {packages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <Card
                key={pkg.id}
                className={`transition-shadow hover:shadow-card-hover ${
                  pkg.highlight ? "border-primary shadow-glow" : pkg.adminOnly ? "border-dashed border-border" : "border-border"
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{pkg.label}</CardTitle>
                    {pkg.highlight && <Badge className="text-xs">Popular</Badge>}
                    {pkg.adminOnly && (
                      <Badge variant="outline" className="text-xs">
                        Só admins
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold tabular-nums">
                    {pkg.credits} {pkg.credits === 1 ? "crédito" : "créditos"}
                  </p>
                  <p className="text-muted-foreground text-sm font-medium">{formatBrl(pkg.amountBrl)}</p>
                  <div className="space-y-2">
                    <Button
                      className="w-full gap-1.5"
                      variant={pkg.highlight ? "default" : "outline"}
                      disabled={buying}
                      onClick={() => setCardPkg(pkg)}
                    >
                      <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                      Cartão de crédito
                    </Button>
                    <Button
                      className="w-full gap-1.5"
                      variant="ghost"
                      disabled={buying}
                      onClick={() => startPix(pkg.id)}
                    >
                      <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                      Pix
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Pix ou cartão via Mercado Pago, sem sair desta página. Créditos extras não expiram.
        </p>
      </section>

      {/* Both dialogs are controlled and have no trigger, so every onOpenChange
          they fire is a close gesture (Esc, overlay, X). */}
      <PixPaymentDialog payment={pix} onOpenChange={() => setPix(null)} />
      <CardPaymentDialog pkg={cardPkg} onOpenChange={() => setCardPkg(null)} />

      {/* Transaction history */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Histórico</h2>

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
        )}

        {!isLoading && transactions.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">Nenhuma movimentação ainda.</p>
          </div>
        )}

        {transactions.length > 0 && (
          <Card className="border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {TYPE_LABELS[tx.type] ?? tx.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {tx.delta > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    )}
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        tx.delta > 0 ? "text-green-600" : "text-destructive"
                      }`}
                    >
                      {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

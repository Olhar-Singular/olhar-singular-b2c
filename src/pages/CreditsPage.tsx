import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Coins, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTransactionHistory, useCreateCheckout } from "@/hooks/useCredits";

const PACKAGES = [
  { credits: 30, amountBrl: 9.9, label: "Básico" },
  { credits: 120, amountBrl: 29.9, label: "Profissional", highlight: true },
  { credits: 300, amountBrl: 59.9, label: "Avançado" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  signup_bonus: "Bônus de cadastro",
  purchase: "Compra",
  adapt: "Adaptação",
  regenerate: "Regeneração",
  chat: "Chat com IA",
  refund: "Reembolso",
};

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CreditsPage() {
  const { profile } = useAuth();
  const { data: transactions = [], isLoading } = useTransactionHistory();
  const checkout = useCreateCheckout();

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
                {profile?.credit_balance ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">créditos disponíveis</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Packages */}
      <section className="space-y-4">
        <h2 className="font-semibold text-foreground">Comprar créditos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PACKAGES.map((pkg) => (
            <Card
              key={pkg.credits}
              className={`transition-shadow hover:shadow-card-hover ${
                pkg.highlight ? "border-primary shadow-glow" : "border-border"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{pkg.label}</CardTitle>
                  {pkg.highlight && (
                    <Badge className="text-xs">Popular</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold tabular-nums">
                  {pkg.credits} créditos
                </p>
                <p className="text-muted-foreground text-sm font-medium">
                  {formatBrl(pkg.amountBrl)}
                </p>
                <Button
                  className="w-full gap-1"
                  variant={pkg.highlight ? "default" : "outline"}
                  disabled={checkout.isPending}
                  onClick={() =>
                    checkout.mutateAsync({ credits: pkg.credits, amountBrl: pkg.amountBrl })
                  }
                >
                  Comprar
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          PIX ou cartão via Mercado Pago. Créditos nunca expiram.
        </p>
      </section>

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

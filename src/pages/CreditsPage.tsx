import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Coins, TrendingUp, TrendingDown } from "lucide-react";
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
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      {/* Balance */}
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Seu saldo atual</p>
        <div className="flex items-center justify-center gap-2">
          <Coins className="w-6 h-6 text-accent" />
          <span className="text-5xl font-bold tabular-nums">
            {profile?.credit_balance ?? "—"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">créditos</p>
      </div>

      {/* Packages */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Comprar créditos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PACKAGES.map((pkg) => (
            <Card
              key={pkg.credits}
              className={pkg.highlight ? "border-primary shadow-glow" : ""}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{pkg.label}</CardTitle>
                {pkg.highlight && (
                  <Badge className="w-fit text-xs">Mais popular</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold tabular-nums">
                  {pkg.credits} créditos
                </p>
                <p className="text-muted-foreground text-sm">
                  {formatBrl(pkg.amountBrl)}
                </p>
                <Button
                  className="w-full"
                  variant={pkg.highlight ? "default" : "outline"}
                  disabled={checkout.isPending}
                  onClick={() =>
                    checkout.mutateAsync({
                      credits: pkg.credits,
                      amountBrl: pkg.amountBrl,
                    })
                  }
                >
                  Comprar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Pagamento via PIX ou cartão (Mercado Pago). Créditos nunca expiram.
        </p>
      </section>

      {/* Transaction history */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Histórico</h2>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}

        {!isLoading && transactions.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma movimentação ainda.
          </p>
        )}

        <ul className="divide-y divide-border rounded-lg border">
          {transactions.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between px-4 py-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {TYPE_LABELS[tx.type] ?? tx.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
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
      </section>
    </main>
  );
}

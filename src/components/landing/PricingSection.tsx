import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlans } from "@/hooks/useSubscription";
import { adaptationsRange, cheapestPublicPlan, formatBrl, publicPlans, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";
import { trackSelectPlan, trackViewPlans } from "@/lib/analytics/events";

const EXTRAS = [
  { credits: 30,  price: "R$ 9,90" },
  { credits: 120, price: "R$ 29,90" },
  { credits: 300, price: "R$ 59,90" },
];

export default function PricingSection() {
  const { data } = usePlans();
  // Memoized: publicPlans allocates, and the effect below keys on identity.
  const plans = useMemo(() => publicPlans(data), [data]);
  const trialPlan = useMemo(() => cheapestPublicPlan(plans), [plans]);

  // Once per rendered catalogue (the fallback first, the real one when it lands).
  useEffect(() => {
    trackViewPlans(plans);
  }, [plans]);

  return (
    <section id="precos" className="py-16 lg:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-foreground mb-3">Planos e preços</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Planos mensais que repõem seus créditos todo mês. Créditos extras avulsos não expiram.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Trial with card: 7 days free on the cheapest plan (spec 2026-09-15) */}
          <div className="bg-card rounded-xl border border-border shadow-card p-6 flex flex-col">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Para conhecer</p>
            <p className="text-2xl font-extrabold text-foreground mb-1">Teste grátis</p>
            <p className="text-sm text-muted-foreground mb-4">{TRIAL_DAYS} dias · {TRIAL_CREDITS} créditos</p>
            <ul className="space-y-2 text-sm text-foreground flex-1 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                {TRIAL_CREDITS} créditos para experimentar
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Acesso a todas as funcionalidades
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Cartão obrigatório. Nada é cobrado por {TRIAL_DAYS} dias.
              </li>
            </ul>
            {trialPlan && (
              <p className="text-xs text-muted-foreground mb-4">
                Depois, {formatBrl(trialPlan.priceBrl)}/mês ({trialPlan.monthlyCredits} créditos). Cancele antes e não paga nada.
              </p>
            )}
            <Link to="/assinar?trial=1">
              <Button variant="outline" className="w-full">Testar {TRIAL_DAYS} dias grátis</Button>
            </Link>
          </div>

          {/* Monthly plans */}
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col ${
                plan.highlight
                  ? "bg-primary text-primary-foreground border-primary shadow-glow"
                  : "bg-card border-border shadow-card"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-semibold uppercase tracking-wide ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {plan.name}
                </p>
                {plan.highlight && <Badge className="text-xs bg-white text-primary">Popular</Badge>}
              </div>
              <p className={`text-2xl font-extrabold mb-1 ${plan.highlight ? "text-primary-foreground" : "text-foreground"}`}>
                {formatBrl(plan.priceBrl)}
                <span className={`text-sm font-medium ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>/mês</span>
              </p>
              <p className={`text-sm mb-4 ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {plan.monthlyCredits} créditos por mês · {adaptationsRange(plan.monthlyCredits)}
              </p>
              <ul className={`space-y-2 text-sm flex-1 mb-6 ${plan.highlight ? "text-primary-foreground/90" : "text-foreground"}`}>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Créditos renovados todo mês
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Cartão de crédito, cancele quando quiser
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Acesso imediato
                </li>
              </ul>
              <Link to={`/assinar?plano=${plan.slug}`} onClick={() => trackSelectPlan(plan)}>
                <Button
                  className={`w-full ${plan.highlight ? "bg-white text-primary hover:bg-white/90" : ""}`}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  Assinar
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground text-center mt-8">
          Precisa de mais num mês? Créditos extras avulsos, por Pix ou cartão, que não expiram:{" "}
          {EXTRAS.map((e, i) => (
            <span key={e.credits}>
              <span className="font-medium text-foreground">{e.credits} por {e.price}</span>
              {i < EXTRAS.length - 1 ? " · " : "."}
            </span>
          ))}
        </p>
        <p className="text-xs text-muted-foreground text-center mt-2">Pagamentos via Mercado Pago.</p>
      </div>
    </section>
  );
}

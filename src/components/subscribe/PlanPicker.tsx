import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBrl } from "@/lib/domain/subscriptionUi";
import { planAdaptationsLabel, pricePerAdaptationLabel } from "@/lib/domain/checkoutCopy";
import type { PlanView } from "@/hooks/useSubscription";

interface PlanPickerProps {
  heading: string;
  plans: PlanView[];
  selectedId: string | null;
  onSelect: (slug: string) => void;
  loading: boolean;
}

// Plans told in adapted activities (what a teacher understands), credits as
// the fine print. Plain toggle buttons (Tab + Enter), not a fake radiogroup: a
// real one would need roving tabindex and arrow keys to honour its semantics.
export default function PlanPicker({ heading, plans, selectedId, onSelect, loading }: PlanPickerProps) {
  return (
    <section className="space-y-3" aria-labelledby="plans-heading">
      <h2 id="plans-heading" className="font-semibold text-foreground">
        {heading}
      </h2>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="plans-loading">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}

      {!loading && plans.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum plano disponível no momento.</p>
      )}

      {plans.length > 0 && (
        <div role="group" aria-label="Planos" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((plan) => {
            const active = selectedId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(plan.slug)}
                className={`relative min-h-[44px] text-left rounded-xl border bg-card p-4 transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "border-primary ring-2 ring-primary/30" : plan.adminOnly ? "border-dashed border-border" : "border-border"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 place-items-center rounded-full border ${active ? "border-primary" : "border-muted-foreground/50"}`}
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{plan.name}</span>
                  </span>
                  {plan.highlight && <Badge className="bg-primary-strong text-xs hover:bg-primary-strong">Popular</Badge>}
                  {plan.adminOnly && (
                    <Badge variant="outline" className="text-xs">
                      Só admins
                    </Badge>
                  )}
                </span>
                <span className="mt-2 block text-2xl font-bold tabular-nums text-foreground">
                  {formatBrl(plan.priceBrl)}
                  <span className="text-sm font-normal text-muted-foreground">/mês</span>
                </span>
                <span className="mt-1 block text-sm font-medium text-foreground">{planAdaptationsLabel(plan)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {plan.monthlyCredits} créditos · {pricePerAdaptationLabel(plan)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
